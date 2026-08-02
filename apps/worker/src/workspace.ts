import { readdir, rm, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type RepositoryWorkspaceState = "CLONEABLE" | "REUSABLE" | "INVALID";

export async function inspectRepositoryWorkspace(
  repositoryPath: string,
): Promise<RepositoryWorkspaceState> {
  try {
    const repository = await stat(repositoryPath);
    if (!repository.isDirectory()) return "INVALID";
    try {
      const gitMetadata = await stat(join(repositoryPath, ".git"));
      if (gitMetadata.isDirectory() || gitMetadata.isFile()) return "REUSABLE";
      return "INVALID";
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
    return (await readdir(repositoryPath)).length === 0 ? "CLONEABLE" : "INVALID";
  } catch (error) {
    if (isMissingPathError(error)) return "CLONEABLE";
    throw error;
  }
}

export function shouldCleanupWorkspace(input: {
  cleanupEnabled: boolean;
  executionSucceeded: boolean;
  userCancelled: boolean;
}): boolean {
  return input.cleanupEnabled && (input.executionSucceeded || input.userCancelled);
}

export function assertSafeRunRoot(workspaceRoot: string, runRoot: string): void {
  const root = resolve(workspaceRoot);
  const target = resolve(runRoot);
  const segments = relative(root, target).split(sep).filter(Boolean);
  if (
    !isAbsolute(target) ||
    !target.startsWith(`${root}${sep}`) ||
    segments.length < 3 ||
    segments.some((segment) => segment === "..")
  ) {
    throw new Error("Refusing to clean a path outside a task run workspace");
  }
}

export async function cleanupRunWorkspace(workspaceRoot: string, runRoot: string): Promise<void> {
  assertSafeRunRoot(workspaceRoot, runRoot);
  await rm(resolve(runRoot), { recursive: true, force: true });
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
