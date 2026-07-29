import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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

  execute(
    input: CodexExecutionInput,
    onEvent: (event: CodexEvent) => Promise<void>,
  ): Promise<CodexExecutionOutput> {
    return new Promise((resolve, reject) => {
      const executable = process.env.CODEX_BIN ?? "codex";
      const sandbox = process.env.CODEX_SANDBOX ?? "workspace-write";
      if (sandbox !== "workspace-write") {
        reject(new Error("CODEX_SANDBOX는 workspace-write만 허용됩니다."));
        return;
      }
      const child = spawn(
        executable,
        [
          "exec",
          "--sandbox",
          sandbox,
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
          env: codexEnvironment(input.workspacePath),
        },
      );
      let stderr = "";
      let stdoutBuffer = "";
      const pendingEvents: Promise<void>[] = [];
      const abort = (): void => {
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        timer.unref();
      };
      input.signal.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          pendingEvents.push(onEvent(parseJsonlEvent(line)));
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8_000);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        input.signal.removeEventListener("abort", abort);
        void (async () => {
          await Promise.all(pendingEvents);
          if (input.signal.aborted) {
            reject(
              input.signal.reason instanceof Error
                ? input.signal.reason
                : new Error("Codex run cancelled"),
            );
            return;
          }
          if (code !== 0) {
            reject(new Error(`Codex CLI 종료 코드 ${String(code)}: ${stderr}`));
            return;
          }
          const raw: unknown = JSON.parse(await readFile(input.outputPath, "utf8"));
          const result = codexResultSchema.parse(raw);
          resolve({ exitCode: code, result, finalMessage: result.summary });
        })().catch(reject);
      });
      child.stdin.end(input.prompt, "utf8");
    });
  }
}

function parseJsonlEvent(line: string): CodexEvent {
  try {
    const payload: unknown = JSON.parse(line);
    const record = payload as Record<string, unknown>;
    return {
      type: typeof record.type === "string" ? record.type : "codex.event",
      message:
        typeof record.message === "string"
          ? record.message
          : JSON.stringify(payload).slice(0, 4000),
      payload,
    };
  } catch {
    return { type: "codex.output", message: line.slice(0, 4000) };
  }
}

function codexEnvironment(workspacePath: string): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "TEMP",
    "TMP",
    "CODEX_HOME",
    "CODEX_API_KEY",
    "OPENAI_API_KEY",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
  ] as const;
  return {
    ...Object.fromEntries(
      allowed.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
    ),
    HOME: workspacePath,
    USERPROFILE: workspacePath,
    GIT_TERMINAL_PROMPT: "0",
  };
}

export function createCodexAdapter(): CodexAdapter {
  return (process.env.CODEX_ADAPTER ?? "fake").toLowerCase() === "real"
    ? new RealCodexAdapter()
    : new FakeCodexAdapter();
}
