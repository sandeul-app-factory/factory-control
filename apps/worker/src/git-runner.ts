import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export function runGit(
  args: readonly string[],
  cwd: string,
  options: { authorizationHeader?: string; allowFailure?: boolean } = {},
): Promise<CommandResult> {
  const subcommand = args.find((argument) => !argument.startsWith("-c"));
  const allowlist = new Set([
    "clone",
    "fetch",
    "checkout",
    "rev-parse",
    "status",
    "diff",
    "add",
    "commit",
    "push",
    "config",
  ]);
  if (!subcommand || !allowlist.has(subcommand)) {
    return Promise.reject(new Error("허용되지 않은 Git command입니다."));
  }
  const finalArgs = [
    ...(options.authorizationHeader
      ? ["-c", `http.extraHeader=Authorization: ${options.authorizationHeader}`]
      : []),
    ...args,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("git", finalArgs, {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-20_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !options.allowFailure) {
        reject(new Error(`Git command failed (${String(code)}): ${stderr.slice(-4000)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function validateGitRef(ref: string): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(ref) ||
    ref.includes("..") ||
    ref.includes("//") ||
    ref.endsWith("/") ||
    ref.endsWith(".lock")
  ) {
    throw new Error("안전하지 않은 Git ref입니다.");
  }
}

export function validateGithubUrl(url: string): string {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Clone URL은 github.com HTTPS Repository만 허용됩니다.");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\.git$/, "")}.git`;
}

export function changedPaths(statusOutput: string): string[] {
  const entries = statusOutput.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (const entry of entries) {
    const path = entry.slice(3);
    if (path) paths.push(path.includes(" -> ") ? (path.split(" -> ").pop() ?? path) : path);
  }
  return paths;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const expression = escaped.replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*");
  return new RegExp(`^${expression}$`);
}

export function enforcePathPolicy(
  changed: string[],
  allowedPatterns: string[],
  deniedPatterns: string[],
): void {
  const denied = deniedPatterns.map(globToRegExp);
  const allowed = allowedPatterns.map(globToRegExp);
  for (const path of changed) {
    if (path.includes("..") || path.startsWith("/") || denied.some((rule) => rule.test(path))) {
      throw new Error(`금지 경로 변경이 감지되었습니다: ${path}`);
    }
    if (allowed.length && !allowed.some((rule) => rule.test(path))) {
      throw new Error(`허용 범위를 벗어난 변경입니다: ${path}`);
    }
  }
}
