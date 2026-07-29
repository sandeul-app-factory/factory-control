import { describe, expect, it, vi } from "vitest";
import { FakeCodexAdapter, buildCodexPrompt } from "./index.js";

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
});
