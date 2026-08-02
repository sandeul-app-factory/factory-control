import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeRunRoot,
  inspectRepositoryWorkspace,
  shouldCleanupWorkspace,
} from "./workspace.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "factory-workspace-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("Codex workspace lifecycle", () => {
  it("allows cloning into missing or empty directories", async () => {
    const root = await temporaryDirectory();
    expect(await inspectRepositoryWorkspace(join(root, "missing"))).toBe("CLONEABLE");
    const empty = join(root, "empty");
    await mkdir(empty);
    expect(await inspectRepositoryWorkspace(empty)).toBe("CLONEABLE");
  });

  it("reuses a Git workspace and rejects unrelated non-empty directories", async () => {
    const root = await temporaryDirectory();
    const reusable = join(root, "reusable");
    await mkdir(join(reusable, ".git"), { recursive: true });
    expect(await inspectRepositoryWorkspace(reusable)).toBe("REUSABLE");
    const invalid = join(root, "invalid");
    await mkdir(invalid);
    await writeFile(join(invalid, "partial.tmp"), "partial");
    expect(await inspectRepositoryWorkspace(invalid)).toBe("INVALID");
  });

  it("preserves failed and timed-out workspaces", () => {
    expect(
      shouldCleanupWorkspace({
        cleanupEnabled: true,
        executionSucceeded: false,
        userCancelled: false,
      }),
    ).toBe(false);
    expect(
      shouldCleanupWorkspace({
        cleanupEnabled: true,
        executionSucceeded: true,
        userCancelled: false,
      }),
    ).toBe(true);
    expect(
      shouldCleanupWorkspace({
        cleanupEnabled: true,
        executionSucceeded: false,
        userCancelled: true,
      }),
    ).toBe(true);
  });

  it("rejects cleanup targets outside a project/task/run hierarchy", () => {
    const root = join(tmpdir(), "factory-root");
    expect(() => assertSafeRunRoot(root, join(root, "project", "task", "run"))).not.toThrow();
    expect(() => assertSafeRunRoot(root, join(root, "project"))).toThrow(
      "outside a task run workspace",
    );
    expect(() => assertSafeRunRoot(root, join(tmpdir(), "outside", "run"))).toThrow(
      "outside a task run workspace",
    );
  });
});
