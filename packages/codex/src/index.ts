import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { sha256 } from "@sandeul/security";

export interface CodexPromptContext {
  project: { id: string; name: string; summary: string };
  lockedPrd: {
    id: string;
    versionNumber: number;
    sha256: string;
    content: string;
    acceptanceCriteria: string[];
  };
  constraints: unknown[];
  decisions: unknown[];
  designs: Array<{
    name: string;
    description: string;
    sha256: string;
    localPath: string;
  }>;
  task: {
    id: string;
    type: string;
    title: string;
    instruction: string;
    acceptanceCriteria: string[];
  };
  repository: {
    owner: string;
    name: string;
    targetBranch: string;
    targetCommitSha?: string;
  };
  allowedPaths: string[];
  deniedPaths: string[];
  testCommands: string[];
}

export interface CodexEvent {
  type: string;
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  payload?: unknown;
}

export const codexResultSchema = z.object({
  status: z.enum(["SUCCEEDED", "FAILED", "BLOCKED"]),
  summary: z.string(),
  changedFiles: z.array(z.object({ path: z.string(), reason: z.string() })),
  tests: z.array(
    z.object({
      command: z.string(),
      status: z.enum(["PASSED", "FAILED", "NOT_RUN"]),
      summary: z.string(),
    }),
  ),
  acceptanceCriteria: z.array(
    z.object({
      criterion: z.string(),
      status: z.enum(["PASSED", "FAILED", "NOT_VERIFIED"]),
      evidence: z.string(),
    }),
  ),
  assumptions: z.array(z.string()),
  questions: z.array(z.string()),
  incompleteItems: z.array(z.string()),
  securityNotes: z.array(z.string()),
});
export type CodexResult = z.infer<typeof codexResultSchema>;

export interface CodexExecutionInput {
  prompt: string;
  workspacePath: string;
  outputSchemaPath: string;
  outputPath: string;
  acceptanceCriteria: string[];
  signal: AbortSignal;
}

export interface CodexExecutionOutput {
  exitCode: number;
  result: CodexResult;
  finalMessage: string;
}

export interface CodexAdapter {
  readonly name: "fake" | "real";
  execute(
    input: CodexExecutionInput,
    onEvent: (event: CodexEvent) => Promise<void>,
  ): Promise<CodexExecutionOutput>;
}

type CodexProcessSpawner = (
  executable: string,
  args: string[],
  options: {
    cwd: string;
    shell: false;
    windowsHide: true;
    stdio: ["pipe", "pipe", "pipe"];
    env: NodeJS.ProcessEnv;
  },
) => ChildProcessWithoutNullStreams;

interface RealCodexAdapterOptions {
  spawnProcess?: CodexProcessSpawner;
  terminateProcessTree?: (child: ChildProcessWithoutNullStreams) => Promise<void>;
  terminalEventGraceMs?: number;
}

const immutableRules = [
  "잠긴 PRD를 변경하지 않는다.",
  "요구사항을 임의 확장하지 않는다.",
  "관련 없는 Refactoring을 하지 않는다.",
  "Secret을 출력하지 않는다.",
  ".env 파일을 Commit하지 않는다.",
  "GitHub Secret을 조회하려 하지 않는다.",
  "Android signing key에 접근하지 않는다.",
  "기존 테스트를 삭제하거나 무력화하지 않는다.",
  "보안검사를 우회하지 않는다.",
  "실패한 테스트를 skip 처리해서 통과시키지 않는다.",
  "완료 전 관련 테스트를 실행한다.",
  "변경 파일과 이유를 보고한다.",
  "미완료 항목을 숨기지 않는다.",
  "추정과 확인된 사실을 구분한다.",
] as const;

export function buildCodexPrompt(context: CodexPromptContext): {
  prompt: string;
  sha256: string;
} {
  const prompt = [
    "# Sandeul App Factory Development Task",
    "",
    "## Authority order",
    "1. 잠긴 PRD",
    "2. CEO Constraint",
    "3. Decision Record",
    "4. 현재 Development Task",
    "5. Acceptance Criteria",
    "6. Repository의 AGENTS.md",
    "7. 기존 코드 규칙",
    "",
    "## Mandatory execution rules",
    ...immutableRules.map((rule) => `- ${rule}`),
    "- 요구사항이 불명확하면 임의 구현하지 말고 질문 또는 가정을 완료 보고서에 기록한다.",
    "",
    "## Project",
    JSON.stringify(context.project, null, 2),
    "",
    "## Locked PRD",
    `Version: ${context.lockedPrd.versionNumber}`,
    `SHA-256: ${context.lockedPrd.sha256}`,
    context.lockedPrd.content,
    "",
    "## CEO Constraints",
    JSON.stringify(context.constraints, null, 2),
    "",
    "## Decision Records",
    JSON.stringify(context.decisions, null, 2),
    "",
    "## Figma design exports",
    context.designs.length
      ? JSON.stringify(context.designs, null, 2)
      : "제공된 디자인 도안이 없습니다.",
    "- .factory-input/designs 파일은 읽기 전용 입력이며 수정하거나 Commit하지 않는다.",
    "",
    "## Current Task",
    JSON.stringify(context.task, null, 2),
    "",
    "## Repository target",
    JSON.stringify(context.repository, null, 2),
    "",
    "## Path policy",
    `Allowed: ${JSON.stringify(context.allowedPaths)}`,
    `Denied: ${JSON.stringify(context.deniedPaths)}`,
    "",
    "## Approved test commands",
    context.testCommands.map((command) => `- ${command}`).join("\n"),
    "",
    "## Acceptance Criteria evidence",
    "- 완료 보고의 acceptanceCriteria 배열에 위 Task의 각 기준 문자열을 정확히 한 번씩 복사한다.",
    "- 각 기준은 PASSED, FAILED, NOT_VERIFIED 중 하나와 재현 가능한 검증 근거를 기록한다.",
    "- 증거가 없으면 PASSED로 표시하지 않는다.",
    "",
    "완료 보고는 제공된 JSON Schema를 정확히 따라야 한다.",
  ].join("\n");
  return { prompt, sha256: sha256(prompt) };
}

export class FakeCodexAdapter implements CodexAdapter {
  readonly name = "fake" as const;

  async execute(
    input: CodexExecutionInput,
    onEvent: (event: CodexEvent) => Promise<void>,
  ): Promise<CodexExecutionOutput> {
    if (input.signal.aborted) throw input.signal.reason;
    await onEvent({ type: "run.started", message: "FakeCodexAdapter 실행을 시작했습니다." });
    await onEvent({
      type: "analysis.completed",
      message: "잠긴 PRD와 Task 경계를 검증했습니다.",
    });
    const result: CodexResult = {
      status: "SUCCEEDED",
      summary: "Fake adapter가 승인된 범위의 개발 작업을 완료했습니다.",
      changedFiles: [
        { path: "app/src/main/java/work/sandeul/factory/FakeFeature.kt", reason: "E2E 검증" },
      ],
      tests: [{ command: "./gradlew test", status: "PASSED", summary: "Fake test passed" }],
      acceptanceCriteria: input.acceptanceCriteria.map((criterion) => ({
        criterion,
        status: "PASSED",
        evidence: "FakeCodexAdapter E2E 검증",
      })),
      assumptions: [],
      questions: [],
      incompleteItems: [],
      securityNotes: ["Secret 및 signing key에 접근하지 않았습니다."],
    };
    await onEvent({ type: "test.completed", message: "Fake 테스트가 통과했습니다." });
    await onEvent({ type: "run.completed", message: result.summary, payload: result });
    return { exitCode: 0, result, finalMessage: result.summary };
  }
}

export class RealCodexAdapter implements CodexAdapter {
  readonly name = "real" as const;

  constructor(private readonly options: RealCodexAdapterOptions = {}) {}

  async execute(
    input: CodexExecutionInput,
    onEvent: (event: CodexEvent) => Promise<void>,
  ): Promise<CodexExecutionOutput> {
    await prepareWindowsWorkspaceAcl(input.workspacePath);
    return new Promise((resolve, reject) => {
      const executable = process.env.CODEX_BIN ?? "codex";
      const sandbox = process.env.CODEX_SANDBOX ?? "workspace-write";
      const permissionProfile = process.env.CODEX_PERMISSION_PROFILE?.trim();
      if (permissionProfile && permissionProfile !== ":workspace") {
        reject(new Error("CODEX_PERMISSION_PROFILE only allows :workspace"));
        return;
      }
      if (!permissionProfile && sandbox !== "workspace-write") {
        reject(new Error("CODEX_SANDBOX는 workspace-write만 허용됩니다."));
        return;
      }
      const permissionArguments = permissionProfile
        ? ["-c", `default_permissions=${JSON.stringify(permissionProfile)}`]
        : ["--sandbox", sandbox];
      const spawnProcess: CodexProcessSpawner = this.options.spawnProcess ?? spawn;
      const child = spawnProcess(
        executable,
        [
          "exec",
          ...permissionArguments,
          "--json",
          "--output-schema",
          input.outputSchemaPath,
          "-o",
          input.outputPath,
          "-",
        ],
        {
          cwd: input.workspacePath,
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
          env: codexEnvironment(),
        },
      );
      let stderr = "";
      let stdoutBuffer = "";
      const pendingEvents: Promise<void>[] = [];
      let settled = false;
      let finalizing = false;
      let terminalEventTimer: NodeJS.Timeout | undefined;
      const terminalEventGraceMs =
        this.options.terminalEventGraceMs ?? readTerminalEventGraceMs(process.env);
      const terminateProcessTree = this.options.terminateProcessTree ?? stopProcessTree;
      const abort = (): void => {
        void terminateProcessTree(child).catch(() => child.kill("SIGKILL"));
      };
      const cleanup = (): void => {
        if (terminalEventTimer) clearTimeout(terminalEventTimer);
        input.signal.removeEventListener("abort", abort);
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      input.signal.addEventListener("abort", abort, { once: true });
      const emitLine = (line: string): void => {
        if (!line.trim()) return;
        const event = parseJsonlEvent(line);
        pendingEvents.push(onEvent(event));
        if (event.type === "turn.completed" && !terminalEventTimer) {
          terminalEventTimer = setTimeout(() => {
            void finalize(0, true);
          }, terminalEventGraceMs);
          terminalEventTimer.unref();
        }
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) emitLine(line);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8_000);
      });
      const finalize = async (code: number, recoverHungProcess: boolean): Promise<void> => {
        if (settled || finalizing) return;
        finalizing = true;
        try {
          if (stdoutBuffer.trim()) {
            emitLine(stdoutBuffer);
            stdoutBuffer = "";
          }
          await Promise.all(pendingEvents);
          if (input.signal.aborted) {
            throw input.signal.reason instanceof Error
              ? input.signal.reason
              : new Error("Codex run cancelled");
          }
          if (!recoverHungProcess && code !== 0) {
            throw new Error(`Codex CLI 종료 코드 ${String(code)}: ${stderr}`);
          }
          const raw: unknown = JSON.parse(await readFile(input.outputPath, "utf8"));
          const result = codexResultSchema.parse(raw);
          if (recoverHungProcess) {
            await onEvent({
              type: "codex.process_recovered",
              level: "WARN",
              message:
                "Codex emitted turn.completed but did not exit; the validated result was recovered and the remaining process tree was stopped.",
            });
          }
          settled = true;
          cleanup();
          if (recoverHungProcess) await terminateProcessTree(child);
          resolve({ exitCode: code, result, finalMessage: result.summary });
        } catch (error) {
          settled = true;
          cleanup();
          if (recoverHungProcess) await terminateProcessTree(child).catch(() => undefined);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      child.on("error", rejectOnce);
      child.on("close", (code) => {
        void finalize(code ?? -1, false);
      });
      child.stdin.end(input.prompt, "utf8");
    });
  }
}

function readTerminalEventGraceMs(source: NodeJS.ProcessEnv): number {
  const value = Number(source.CODEX_TERMINAL_EVENT_GRACE_MS ?? 10_000);
  return Number.isSafeInteger(value) && value >= 1_000 && value <= 60_000 ? value : 10_000;
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child.pid) {
    child.kill("SIGKILL");
    return;
  }
  if (process.platform === "win32") {
    await promisify(execFile)("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }).catch(() => undefined);
    return;
  }
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  timer.unref();
}

type AclCommandRunner = (executable: string, args: string[]) => Promise<void>;

interface WindowsWorkspaceAclOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  run?: AclCommandRunner;
  readMarker?: (path: string) => Promise<string | undefined>;
  writeMarker?: (path: string, value: string) => Promise<void>;
}

const runAclCommand: AclCommandRunner = async (executable, args) => {
  await promisify(execFile)(executable, args, {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
};

async function readAclMarker(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeAclMarker(path: string, value: string): Promise<void> {
  await writeFile(path, value, { encoding: "utf8", mode: 0o600 });
}

export async function prepareWindowsWorkspaceAcl(
  workspacePath: string,
  options: WindowsWorkspaceAclOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const group = env.CODEX_WINDOWS_SANDBOX_GROUP?.trim();
  if (platform !== "win32" || !group) return;
  if (!/^[A-Za-z0-9_.-]+(?:\\[A-Za-z0-9_. -]+)?$/.test(group)) {
    throw new Error("CODEX_WINDOWS_SANDBOX_GROUP contains unsupported characters");
  }
  const workspaceRoot = env.CODEX_WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    throw new Error("CODEX_WORKSPACE_ROOT is required for Windows workspace ACL setup");
  }
  const root = resolve(workspaceRoot);
  const workspace = resolve(workspacePath);
  const fromRoot = relative(root, workspace);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("Codex workspace must be a child of CODEX_WORKSPACE_ROOT");
  }
  const markerPath = join(dirname(workspace), ".codex-windows-acl-v1");
  const markerValue = JSON.stringify({ version: 1, workspace, group });
  const readMarker = options.readMarker ?? readAclMarker;
  const writeMarker = options.writeMarker ?? writeAclMarker;
  if ((await readMarker(markerPath)) === markerValue) return;
  const run = options.run ?? runAclCommand;
  await run("icacls.exe", [workspace, "/grant:r", `${group}:(OI)(CI)(M)`, "/T", "/C", "/Q"]);

  const gitDirectory = join(workspace, ".git");
  await run("icacls.exe", [gitDirectory, "/inheritance:d", "/T", "/C", "/Q"]);
  await run("icacls.exe", [gitDirectory, "/remove:g", group, "/T", "/C", "/Q"]);
  await run("icacls.exe", [gitDirectory, "/grant:r", `${group}:(OI)(CI)(RX)`, "/T", "/C", "/Q"]);
  await writeMarker(markerPath, markerValue);
}

function compactText(value: string, maxLength = 500): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function summarizeCodexJsonlEvent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Codex 작업 정보가 갱신되었습니다.";
  const record = payload as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "codex.event";
  const item =
    record.item && typeof record.item === "object"
      ? (record.item as Record<string, unknown>)
      : undefined;
  const itemType = typeof item?.type === "string" ? item.type : undefined;

  if (type === "thread.started") return "Codex 개발 세션을 시작했습니다.";
  if (type === "turn.started") return "요구사항을 분석하고 구현을 시작했습니다.";
  if (type === "turn.completed") return "Codex 구현 단계가 완료되었습니다.";
  if (type === "turn.failed" || type === "error") {
    const message = typeof record.message === "string" ? compactText(record.message, 300) : "";
    return message ? `Codex 실행이 실패했습니다: ${message}` : "Codex 실행이 실패했습니다.";
  }
  if (itemType === "agent_message") {
    const text = typeof item?.text === "string" ? compactText(item.text) : "";
    return text || "Codex가 진행 상태를 정리했습니다.";
  }
  if (itemType === "command_execution") {
    const exitCode = typeof item?.exit_code === "number" ? item.exit_code : undefined;
    if (type === "item.started") return "구현·검증 명령을 실행 중입니다.";
    if (exitCode === 0) return "구현·검증 명령이 정상 완료되었습니다.";
    return `구현·검증 명령이 실패했습니다${exitCode === undefined ? "." : ` (exit ${exitCode}).`}`;
  }
  if (itemType === "file_change") {
    const changes = Array.isArray(item?.changes) ? item.changes.length : undefined;
    return changes ? `소스 파일 ${changes}개를 변경했습니다.` : "소스 파일을 변경했습니다.";
  }
  if (itemType === "todo_list") return "개발 작업 계획과 진행률을 갱신했습니다.";
  if (itemType === "reasoning") return "요구사항과 현재 구현을 분석했습니다.";
  if (itemType === "web_search") return "구현에 필요한 공식 자료를 확인했습니다.";
  if (type === "item.started") return "Codex가 다음 개발 단계를 시작했습니다.";
  if (type === "item.completed") return "Codex가 개발 단계 하나를 완료했습니다.";
  const message = typeof record.message === "string" ? compactText(record.message) : "";
  return message || "Codex 작업 상태가 갱신되었습니다.";
}

function parseJsonlEvent(line: string): CodexEvent {
  try {
    const payload: unknown = JSON.parse(line);
    const record = payload as Record<string, unknown>;
    return {
      type: typeof record.type === "string" ? record.type : "codex.event",
      message: summarizeCodexJsonlEvent(payload),
      payload,
    };
  } catch {
    return { type: "codex.output", message: "Codex 작업 정보가 갱신되었습니다." };
  }
}

export function codexEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "CODEX_HOME",
    "CODEX_API_KEY",
    "OPENAI_API_KEY",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
  ] as const;
  return {
    ...Object.fromEntries(allowed.flatMap((key) => (source[key] ? [[key, source[key]]] : []))),
    GIT_TERMINAL_PROMPT: "0",
  };
}

export function createCodexAdapter(): CodexAdapter {
  return (process.env.CODEX_ADAPTER ?? "fake").toLowerCase() === "real"
    ? new RealCodexAdapter()
    : new FakeCodexAdapter();
}
