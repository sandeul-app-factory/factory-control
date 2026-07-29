import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  inspectAndroidManifest,
  inspectAndroidSource,
  sha256,
  type AndroidSecurityFinding,
} from "@sandeul/security";

export type PipelineStatus = "PASSED" | "FAILED" | "SKIPPED";

export interface PipelineStep {
  id: string;
  suite: "TEST" | "SECURITY" | "BUILD";
  name: string;
  command: string;
  status: PipelineStatus;
  durationMs: number;
  message: string;
}

export interface PipelineArtifact {
  name: string;
  mimeType: string;
  buffer: Buffer;
  sha256: string;
}

export interface AndroidPipelineResult {
  steps: PipelineStep[];
  findings: AndroidSecurityFinding[];
  sbom?: PipelineArtifact;
  buildArtifact?: PipelineArtifact;
  testStatus: "PASSED" | "FAILED";
  securityStatus: "PASSED" | "FAILED";
  buildStatus: "SUCCEEDED" | "FAILED";
}

interface RunPipelineInput {
  repositoryPath: string;
  outputDirectory: string;
  fake: boolean;
  signal: AbortSignal;
  onEvent: (
    type: string,
    message: string,
    payload?: Record<string, unknown>,
    level?: "INFO" | "WARN" | "ERROR",
  ) => Promise<void>;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  missing: boolean;
}

const sourceExtensions = new Set([".kt", ".kts", ".java"]);
const ignoredDirectories = new Set([
  ".git",
  ".gradle",
  ".idea",
  "build",
  "generated",
  "node_modules",
]);

function capped(text: string, max = 20_000): string {
  return text.length <= max ? text : text.slice(text.length - max);
}

function toolFinding(
  tool: string,
  severity: AndroidSecurityFinding["severity"],
  title: string,
  description: string,
  remediation: string,
): AndroidSecurityFinding {
  return {
    fingerprint: sha256(`${tool}:${title}:${description}`).slice(0, 48),
    severity,
    ruleId: `PIPELINE-${tool.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "-")}`,
    title,
    description: capped(description, 4_000),
    remediation,
  };
}

async function runCommand(
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  maxOutputBytes = 2_000_000,
): Promise<CommandResult> {
  const started = Date.now();
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: {
        ...process.env,
        GRADLE_USER_HOME:
          process.env.GRADLE_USER_HOME ?? join(process.env.CODEX_WORKSPACE_ROOT ?? cwd, ".gradle"),
      },
      shell: false,
      windowsHide: true,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = capped(`${stdout}${chunk}`, maxOutputBytes);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = capped(`${stderr}${chunk}`, maxOutputBytes);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        resolveResult({
          exitCode: null,
          stdout,
          stderr: error.message,
          durationMs: Date.now() - started,
          missing: true,
        });
        return;
      }
      reject(error);
    });
    child.on("close", (exitCode) => {
      resolveResult({
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        missing: false,
      });
    });
  });
}

function javaCommand(repositoryPath: string, task: string): { executable: string; args: string[] } {
  const javaHome = process.env.JAVA_HOME?.trim();
  if (!javaHome) {
    throw new Error("JAVA_HOME이 없습니다. Android Studio JBR(JDK 17)을 지정해야 합니다.");
  }
  const executable = join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
  const wrapperJar = join(repositoryPath, "gradle", "wrapper", "gradle-wrapper.jar");
  return {
    executable,
    args: [
      "-classpath",
      wrapperJar,
      "org.gradle.wrapper.GradleWrapperMain",
      task,
      "--no-daemon",
      "--stacktrace",
    ],
  };
}

async function gradleStep(
  repositoryPath: string,
  task: string,
  suite: PipelineStep["suite"],
  signal: AbortSignal,
): Promise<PipelineStep> {
  const command = javaCommand(repositoryPath, task);
  const result = await runCommand(command.executable, command.args, repositoryPath, signal);
  const status = result.exitCode === 0 ? "PASSED" : "FAILED";
  return {
    id: randomUUID(),
    suite,
    name: `Gradle ${task}`,
    command: `./gradlew ${task}`,
    status,
    durationMs: result.durationMs,
    message: capped(result.stderr || result.stdout || `exit=${String(result.exitCode)}`),
  };
}

async function collectFiles(root: string): Promise<{ manifests: string[]; sources: string[] }> {
  const manifests: string[] = [];
  const sources: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name === "AndroidManifest.xml") {
        manifests.push(path);
      } else if (entry.isFile() && sourceExtensions.has(extname(entry.name).toLowerCase())) {
        sources.push(path);
      }
    }
  };
  await visit(root);
  return { manifests, sources };
}

async function builtInSecurityScan(repositoryPath: string): Promise<AndroidSecurityFinding[]> {
  const { manifests, sources } = await collectFiles(repositoryPath);
  const findings: AndroidSecurityFinding[] = [];
  if (!manifests.length) {
    findings.push(
      toolFinding(
        "android-manifest",
        "CRITICAL",
        "AndroidManifest.xml을 찾을 수 없음",
        "Android 앱 보안 검사를 수행할 Manifest가 없습니다.",
        "Android app module과 Manifest를 생성한 뒤 다시 실행하세요.",
      ),
    );
  }
  for (const path of manifests) {
    const source = await readFile(path, "utf8");
    findings.push(
      ...inspectAndroidManifest(source).map((finding) => ({
        ...finding,
        description: `${relative(repositoryPath, path)}: ${finding.description}`,
      })),
    );
  }
  for (const path of sources.slice(0, 20_000)) {
    const source = await readFile(path, "utf8");
    findings.push(
      ...inspectAndroidSource(source).map((finding) => ({
        ...finding,
        description: `${relative(repositoryPath, path)}: ${finding.description}`,
      })),
    );
  }
  return findings;
}

async function runExternalSecurity(
  repositoryPath: string,
  outputDirectory: string,
  signal: AbortSignal,
): Promise<{
  steps: PipelineStep[];
  findings: AndroidSecurityFinding[];
  sbom?: PipelineArtifact;
}> {
  const reportPath = join(outputDirectory, "gitleaks.json");
  const specifications = [
    {
      name: "Gitleaks",
      executable: process.env.GITLEAKS_BIN ?? "gitleaks",
      args: ["git", "--redact", "--report-format", "json", "--report-path", reportPath, "."],
      severity: "CRITICAL" as const,
    },
    {
      name: "Semgrep",
      executable: process.env.SEMGREP_BIN ?? "semgrep",
      args: ["scan", "--oss-only", "--config", "auto", "--json", "--error", "."],
      severity: "HIGH" as const,
    },
    {
      name: "Trivy filesystem",
      executable: process.env.TRIVY_BIN ?? "trivy",
      args: [
        "fs",
        "--exit-code",
        "1",
        "--severity",
        "CRITICAL,HIGH",
        "--scanners",
        "vuln,secret,misconfig",
        "--format",
        "json",
        ".",
      ],
      severity: "HIGH" as const,
    },
    {
      name: "OSV Scanner",
      executable: process.env.OSV_SCANNER_BIN ?? "osv-scanner",
      args: ["scan", "source", "--recursive", "--format", "json", "."],
      severity: "HIGH" as const,
    },
  ];
  const steps: PipelineStep[] = [];
  const findings: AndroidSecurityFinding[] = [];
  for (const specification of specifications) {
    const result = await runCommand(
      specification.executable,
      specification.args,
      repositoryPath,
      signal,
    );
    const status = result.exitCode === 0 ? "PASSED" : "FAILED";
    steps.push({
      id: randomUUID(),
      suite: "SECURITY",
      name: specification.name,
      command: `${specification.executable} ${specification.args.join(" ")}`,
      status,
      durationMs: result.durationMs,
      message: capped(result.stderr || result.stdout || `exit=${String(result.exitCode)}`),
    });
    if (result.missing) {
      findings.push(
        toolFinding(
          specification.name,
          "HIGH",
          `${specification.name}가 설치되지 않음`,
          `${specification.executable} 실행 파일을 Worker PATH에서 찾을 수 없습니다.`,
          "운영 문서의 Android 보안 도구를 설치하고 Worker를 다시 시작하세요.",
        ),
      );
    } else if (result.exitCode !== 0) {
      findings.push(
        toolFinding(
          specification.name,
          specification.severity,
          `${specification.name} 검사 실패 또는 차단 Finding`,
          result.stderr || result.stdout || `exit=${String(result.exitCode)}`,
          `${specification.name} 원본 보고서를 확인하고 Finding을 수정한 뒤 재작업하세요.`,
        ),
      );
    }
  }

  const syftExecutable = process.env.SYFT_BIN ?? "syft";
  const syft = await runCommand(
    syftExecutable,
    ["dir:.", "-o", "spdx-json"],
    repositoryPath,
    signal,
    25_000_000,
  );
  steps.push({
    id: randomUUID(),
    suite: "SECURITY",
    name: "SPDX SBOM",
    command: `${syftExecutable} dir:. -o spdx-json`,
    status: syft.exitCode === 0 ? "PASSED" : "FAILED",
    durationMs: syft.durationMs,
    message:
      syft.exitCode === 0
        ? "SPDX JSON SBOM을 생성했습니다."
        : capped(syft.stderr || "SBOM 생성 실패"),
  });
  let sbom: PipelineArtifact | undefined;
  if (syft.exitCode === 0 && syft.stdout.trim()) {
    const buffer = Buffer.from(syft.stdout, "utf8");
    sbom = {
      name: "release-source.spdx.json",
      mimeType: "application/json",
      buffer,
      sha256: sha256(buffer),
    };
  } else {
    findings.push(
      toolFinding(
        "syft",
        "HIGH",
        "SBOM 생성 실패",
        syft.missing
          ? `${syftExecutable} 실행 파일을 찾을 수 없습니다.`
          : syft.stderr || "유효한 SPDX JSON이 생성되지 않았습니다.",
        "Syft를 설치하고 SPDX JSON 생성 오류를 해결하세요.",
      ),
    );
  }
  if (!(process.env.MOBSF_ENDPOINT ?? "").trim()) {
    findings.push(
      toolFinding(
        "mobsf",
        "INFO",
        "MobSF Adapter가 비활성화됨",
        "MOBSF_ENDPOINT가 설정되지 않아 동적 APK 분석은 실행하지 않았습니다.",
        "운영 보안 수준에 따라 MobSF Endpoint와 Credential을 설정하세요.",
      ),
    );
  }
  return { steps, findings, ...(sbom ? { sbom } : {}) };
}

async function findNewestArtifact(root: string, extensions: Set<string>): Promise<string | null> {
  const candidates: Array<{ path: string; fingerprint: number }> = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name) || entry.name === "build") await visit(path);
      } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        const data = await readFile(path);
        const fingerprint = Number.parseInt(sha256(data).slice(0, 12), 16);
        candidates.push({ path, fingerprint });
      }
    }
  };
  await visit(root);
  candidates.sort((left, right) => {
    const extensionPriority =
      Number(right.path.toLowerCase().endsWith(".aab")) -
      Number(left.path.toLowerCase().endsWith(".aab"));
    return extensionPriority || right.fingerprint - left.fingerprint;
  });
  return candidates[0]?.path ?? null;
}

function fakeResult(): AndroidPipelineResult {
  const sbomBuffer = Buffer.from(
    JSON.stringify({
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      SPDXID: "SPDXRef-DOCUMENT",
      name: "FakeCodexAdapter-E2E",
      documentNamespace: `https://factory.sandeul.work/spdx/${randomUUID()}`,
      creationInfo: {
        created: new Date().toISOString(),
        creators: ["Tool: Sandeul-FakeCodexAdapter"],
      },
      packages: [],
    }),
    "utf8",
  );
  const artifactBuffer = Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64");
  const names = [
    ["TEST", "Gradle test"],
    ["TEST", "Android Lint"],
    ["TEST", "detekt"],
    ["TEST", "ktlint"],
    ["SECURITY", "Gitleaks"],
    ["SECURITY", "Semgrep"],
    ["SECURITY", "Trivy filesystem"],
    ["SECURITY", "OSV Scanner"],
    ["SECURITY", "SPDX SBOM"],
    ["BUILD", "Debug APK"],
  ] as const;
  return {
    steps: names.map(([suite, name]) => ({
      id: randomUUID(),
      suite,
      name,
      command: `fake:${name}`,
      status: "PASSED",
      durationMs: 1,
      message: "FakeCodexAdapter 품질 파이프라인 통과",
    })),
    findings: [],
    sbom: {
      name: "fake-release-source.spdx.json",
      mimeType: "application/json",
      buffer: sbomBuffer,
      sha256: sha256(sbomBuffer),
    },
    buildArtifact: {
      name: "fake-release-candidate.apk",
      mimeType: "application/vnd.android.package-archive",
      buffer: artifactBuffer,
      sha256: sha256(artifactBuffer),
    },
    testStatus: "PASSED",
    securityStatus: "PASSED",
    buildStatus: "SUCCEEDED",
  };
}

export async function runAndroidPipeline(input: RunPipelineInput): Promise<AndroidPipelineResult> {
  if (input.fake) {
    await input.onEvent("pipeline.fake", "Fake 독립 테스트·보안검사·빌드를 실행했습니다.");
    return fakeResult();
  }
  const steps: PipelineStep[] = [];
  await input.onEvent("test.started", "독립 Gradle 테스트와 정적 분석을 시작합니다.");
  for (const task of ["test", "lint", "detekt", "ktlintCheck"]) {
    const step = await gradleStep(input.repositoryPath, task, "TEST", input.signal);
    steps.push(step);
    await input.onEvent(
      "test.step",
      `${step.name}: ${step.status}`,
      { command: step.command, durationMs: step.durationMs },
      step.status === "FAILED" ? "ERROR" : "INFO",
    );
  }

  await input.onEvent("security.started", "Android 내장 규칙과 외부 보안 도구를 실행합니다.");
  const findings = await builtInSecurityScan(input.repositoryPath);
  const external = await runExternalSecurity(
    input.repositoryPath,
    input.outputDirectory,
    input.signal,
  );
  steps.push(...external.steps);
  findings.push(...external.findings);

  await input.onEvent("build.started", "unsigned/debug Release Candidate 빌드를 시작합니다.");
  for (const task of ["assembleDebug", "bundleRelease"]) {
    const step = await gradleStep(input.repositoryPath, task, "BUILD", input.signal);
    steps.push(step);
    await input.onEvent(
      "build.step",
      `${step.name}: ${step.status}`,
      { command: step.command, durationMs: step.durationMs },
      step.status === "FAILED" ? "ERROR" : "INFO",
    );
  }
  const builtPath = await findNewestArtifact(
    input.repositoryPath,
    new Set<string>([".aab", ".apk"]),
  );
  const apkPath = await findNewestArtifact(input.repositoryPath, new Set<string>([".apk"]));
  let buildArtifact: PipelineArtifact | undefined;
  if (builtPath) {
    const buffer = await readFile(resolve(builtPath));
    const extension = extname(builtPath).toLowerCase();
    buildArtifact = {
      name: basename(builtPath),
      mimeType:
        extension === ".apk"
          ? "application/vnd.android.package-archive"
          : "application/octet-stream",
      buffer,
      sha256: sha256(buffer),
    };
  }
  const smokeSerial = process.env.ANDROID_SMOKE_TEST_SERIAL?.trim();
  if (!smokeSerial) {
    steps.push({
      id: randomUUID(),
      suite: "TEST",
      name: "APK install smoke test",
      command: "adb -s <configured-emulator> install -r <apk>",
      status: "SKIPPED",
      durationMs: 0,
      message:
        "ANDROID_SMOKE_TEST_SERIAL이 설정되지 않아 설치 검증을 실행하지 않았습니다. Release Gate를 통과하려면 전용 Emulator serial을 설정하세요.",
    });
  } else if (!apkPath) {
    steps.push({
      id: randomUUID(),
      suite: "TEST",
      name: "APK install smoke test",
      command: `adb -s ${smokeSerial} install -r <apk>`,
      status: "FAILED",
      durationMs: 0,
      message: "설치할 Debug APK를 찾을 수 없습니다.",
    });
  } else {
    const adbExecutable =
      process.env.ANDROID_ADB_BIN ??
      join(
        process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "",
        "platform-tools",
        process.platform === "win32" ? "adb.exe" : "adb",
      );
    const smoke = await runCommand(
      adbExecutable,
      ["-s", smokeSerial, "install", "-r", resolve(apkPath)],
      input.repositoryPath,
      input.signal,
    );
    steps.push({
      id: randomUUID(),
      suite: "TEST",
      name: "APK install smoke test",
      command: `adb -s ${smokeSerial} install -r ${basename(apkPath)}`,
      status: smoke.exitCode === 0 ? "PASSED" : "FAILED",
      durationMs: smoke.durationMs,
      message: capped(smoke.stderr || smoke.stdout || `exit=${String(smoke.exitCode)}`),
    });
  }
  const testStatus = steps
    .filter((step) => step.suite === "TEST")
    .every((step) => step.status === "PASSED")
    ? "PASSED"
    : "FAILED";
  const securityStatus =
    findings.every((finding) => !["CRITICAL", "HIGH"].includes(finding.severity)) &&
    external.steps.every((step) => step.status === "PASSED") &&
    Boolean(external.sbom)
      ? "PASSED"
      : "FAILED";
  const buildStatus =
    steps.filter((step) => step.suite === "BUILD").every((step) => step.status === "PASSED") &&
    buildArtifact
      ? "SUCCEEDED"
      : "FAILED";
  return {
    steps,
    findings,
    ...(external.sbom ? { sbom: external.sbom } : {}),
    ...(buildArtifact ? { buildArtifact } : {}),
    testStatus,
    securityStatus,
    buildStatus,
  };
}
