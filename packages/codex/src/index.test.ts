import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FakeCodexAdapter,
  RealCodexAdapter,
  buildCodexPrompt,
  codexEnvironment,
  prepareWindowsWorkspaceAcl,
} from "./index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Codex execution contract", () => {
  it("renders authority, immutable rules, task, and locked PRD hash", () => {
    const output = buildCodexPrompt({
      project: { id: "project", name: "Factory", summary: "Control plane" },
      lockedPrd: {
        id: "prd",
        versionNumber: 2,
        sha256: "a".repeat(64),
        content: "# PRD",
        acceptanceCriteria: ["passes"],
      },
      constraints: [{ title: "No signing key" }],
      decisions: [{ title: "MVP" }],
      task: {
        id: "task",
        type: "IMPLEMENT_PRD",
        title: "Implement",
        instruction: "Do the task",
        acceptanceCriteria: ["passes"],
      },
      repository: { owner: "sandeul", name: "app", targetBranch: "main" },
      allowedPaths: ["app/**"],
      deniedPaths: [".env"],
      testCommands: ["./gradlew test"],
    });
    expect(output.prompt).toContain("1. 잠긴 PRD");
    expect(output.prompt).toContain("Android signing key에 접근하지 않는다.");
    expect(output.prompt).toContain("a".repeat(64));
    expect(output.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fake adapter emits JSON-compatible result events", async () => {
    const event = vi.fn(() => Promise.resolve());
    const controller = new AbortController();
    const result = await new FakeCodexAdapter().execute(
      {
        prompt: "prompt",
        workspacePath: "/tmp/fake",
        outputPath: "/tmp/result.json",
        outputSchemaPath: "/tmp/schema.json",
        acceptanceCriteria: ["passes"],
        signal: controller.signal,
      },
      event,
    );
    expect(result.result.status).toBe("SUCCEEDED");
    expect(result.result.acceptanceCriteria).toEqual([
      {
        criterion: "passes",
        status: "PASSED",
        evidence: "FakeCodexAdapter E2E 검증",
      },
    ]);
    expect(event).toHaveBeenCalledTimes(4);
  });

  it("grants task workspace writes while keeping git metadata read-only on Windows", async () => {
    const calls: Array<{ executable: string; args: string[] }> = [];
    let marker: string | undefined;
    const options = {
      platform: "win32",
      env: {
        CODEX_WORKSPACE_ROOT: "C:\\factory",
        CODEX_WINDOWS_SANDBOX_GROUP: "FACTORY\\CodexSandboxUsers",
      },
      run: (executable: string, args: string[]) => {
        calls.push({ executable, args });
        return Promise.resolve();
      },
      readMarker: () => Promise.resolve(marker),
      writeMarker: (_path: string, value: string) => {
        marker = value;
        return Promise.resolve();
      },
    } as const;
    await prepareWindowsWorkspaceAcl("C:\\factory\\project\\task\\run\\repository", options);
    await prepareWindowsWorkspaceAcl("C:\\factory\\project\\task\\run\\repository", options);
    expect(calls).toHaveLength(4);
    expect(marker).toContain('"version":1');
    expect(calls[0]?.args).toContain("FACTORY\\CodexSandboxUsers:(OI)(CI)(M)");
    expect(calls.every(({ args }) => args.includes("/Q"))).toBe(true);
    expect(calls[3]?.args).toContain("FACTORY\\CodexSandboxUsers:(OI)(CI)(RX)");
    expect(calls[3]?.args[0]).toMatch(/repository[\\/]\.git$/);
  });

  it("rejects Windows ACL changes outside the configured workspace root", async () => {
    await expect(
      prepareWindowsWorkspaceAcl("C:\\outside\\repository", {
        platform: "win32",
        env: {
          CODEX_WORKSPACE_ROOT: "C:\\factory",
          CODEX_WINDOWS_SANDBOX_GROUP: "FACTORY\\CodexSandboxUsers",
        },
        run: () => Promise.resolve(),
      }),
    ).rejects.toThrow("Codex workspace must be a child");
  });

  it("preserves the Windows profile needed by Codex without forwarding arbitrary secrets", () => {
    const environment = codexEnvironment({
      PATH: "C:\\Windows",
      USERPROFILE: "C:\\Users\\worker",
      APPDATA: "C:\\Users\\worker\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\worker\\AppData\\Local",
      CODEX_HOME: "C:\\Users\\worker\\.codex",
      FACTORY_SECRET: "must-not-leak",
    });
    expect(environment.USERPROFILE).toBe("C:\\Users\\worker");
    expect(environment.APPDATA).toContain("AppData");
    expect(environment.FACTORY_SECRET).toBeUndefined();
    expect(environment.GIT_TERMINAL_PROMPT).toBe("0");
  });

  it("recovers a validated result when Codex emits turn.completed but does not exit", async () => {
    vi.stubEnv("CODEX_PERMISSION_PROFILE", ":workspace");
    const directory = await mkdtemp(join(tmpdir(), "factory-codex-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "result.json");
    await writeFile(
      outputPath,
      JSON.stringify({
        status: "FAILED",
        summary: "Release gate blocked",
        changedFiles: [],
        tests: [],
        acceptanceCriteria: [],
        assumptions: [],
        questions: [],
        incompleteItems: ["security findings remain"],
        securityNotes: [],
      }),
      "utf8",
    );
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => true),
    });
    const terminateProcessTree = vi.fn(() => Promise.resolve());
    const adapter = new RealCodexAdapter({
      spawnProcess: () => child as never,
      terminateProcessTree,
      terminalEventGraceMs: 5,
    });
    const onEvent = vi.fn(() => Promise.resolve());
    const execution = adapter.execute(
      {
        prompt: "prompt",
        workspacePath: directory,
        outputSchemaPath: join(directory, "schema.json"),
        outputPath,
        acceptanceCriteria: [],
        signal: new AbortController().signal,
      },
      onEvent,
    );
    child.stdout.write(`${JSON.stringify({ type: "turn.completed" })}\n`);

    await expect(execution).resolves.toMatchObject({
      exitCode: 0,
      result: { status: "FAILED", summary: "Release gate blocked" },
    });
    expect(terminateProcessTree).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "codex.process_recovered", level: "WARN" }),
    );
  });
});
