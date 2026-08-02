import { mkdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { Prisma, prisma } from "@sandeul/database";
import { buildCodexPrompt, createCodexAdapter } from "@sandeul/codex";
import { createGithubAdapter } from "@sandeul/github";
import { assertProjectTransition } from "@sandeul/contracts";
import type { ProjectStatus } from "@sandeul/contracts";
import { evaluateReleaseGate, sha256 } from "@sandeul/security";
import { storePipelineArtifact } from "./artifact-writer.js";
import {
  runAndroidPipeline,
  type AndroidPipelineResult,
  type PipelineArtifact,
} from "./android-pipeline.js";
import {
  changedPaths,
  enforcePathPolicy,
  runGit,
  validateGithubUrl,
  validateGitRef,
} from "./git-runner.js";
import {
  cleanupRunWorkspace,
  inspectRepositoryWorkspace,
  shouldCleanupWorkspace,
} from "./workspace.js";

interface FactoryJobData {
  developmentTaskId: string;
  codexRunId: string;
  jobRecordId: string;
}

interface WorkerResult {
  cancelled?: boolean;
  commitSha?: string;
  pullRequestUrl?: string;
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queueName = process.env.CODEX_QUEUE_NAME ?? "codex-tasks";
const concurrency = Number(process.env.CODEX_CONCURRENCY ?? 1);
const jobTimeoutMs = Number(process.env.CODEX_JOB_TIMEOUT_MS ?? 10_800_000);
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error("CODEX_CONCURRENCY는 1~8 범위의 정수여야 합니다.");
}
if (!Number.isSafeInteger(jobTimeoutMs) || jobTimeoutMs < 60_000 || jobTimeoutMs > 86_400_000) {
  throw new Error("CODEX_JOB_TIMEOUT_MS must be between 60000 and 86400000 milliseconds");
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("작업 경계 데이터가 문자열 배열이 아닙니다.");
  }
  return value as string[];
}

function latestLogicalVersions<T extends { logicalId: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.logicalId)) return false;
    seen.add(record.logicalId);
    return true;
  });
}

function safeWorkspace(projectId: string, taskId: string, runId: string): string {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (![projectId, taskId, runId].every((value) => uuid.test(value))) {
    throw new Error("Workspace 식별자가 올바르지 않습니다.");
  }
  const root = resolve(process.env.CODEX_WORKSPACE_ROOT ?? "/srv/factory-workspaces");
  if (root === resolve("/") || root === resolve(process.env.HOME ?? "__invalid__")) {
    throw new Error("CODEX_WORKSPACE_ROOT가 너무 광범위합니다.");
  }
  const target = resolve(root, projectId, taskId, runId);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("Workspace 경계를 벗어났습니다.");
  return target;
}

async function addEvent(
  codexRunId: string,
  sequence: { value: number },
  type: string,
  message: string,
  payload?: unknown,
  level = "INFO",
): Promise<void> {
  sequence.value += 1;
  await prisma.codexRunEvent.create({
    data: {
      codexRunId,
      sequence: sequence.value,
      eventType: type.slice(0, 100),
      level: level.slice(0, 20),
      message: message.slice(0, 20_000),
      payload: payload ? (payload as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}

async function transitionProject(
  projectId: string,
  to: ProjectStatus,
  actorId: string,
  taskId: string,
  requestId: string,
  reason: string,
): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status === to) return;
  assertProjectTransition(project.status as ProjectStatus, to);
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { status: to, version: { increment: 1 } },
    }),
    prisma.projectStateHistory.create({
      data: {
        projectId,
        previousStatus: project.status,
        newStatus: to,
        actorId,
        reason,
        taskId,
        requestId,
      },
    }),
  ]);
}

async function audit(
  action: string,
  projectId: string,
  actorId: string,
  resourceType: string,
  resourceId: string,
  requestId: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      resourceType,
      resourceId,
      projectId,
      requestId,
      outcome: "SUCCESS",
      metadata: metadata ?? Prisma.JsonNull,
    },
  });
}

function jsonArtifact(name: string, value: unknown): PipelineArtifact {
  const buffer = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  return { name, mimeType: "application/json", buffer, sha256: sha256(buffer) };
}

async function recordPipelineResult(input: {
  projectId: string;
  taskId: string;
  runId: string;
  actorId: string;
  commitSha: string;
  prdId: string;
  prdSha256: string;
  acceptanceCriteria: string[];
  acceptanceEvidence: Array<{
    criterion: string;
    status: "PASSED" | "FAILED" | "NOT_VERIFIED";
    evidence: string;
  }>;
  pipeline: AndroidPipelineResult;
  requestId: string;
}): Promise<{ gatePassed: boolean; releaseId: string; testPassed: boolean }> {
  const acceptanceResults = input.acceptanceCriteria.map(
    (criterion) =>
      input.acceptanceEvidence.find((evidence) => evidence.criterion === criterion) ?? {
        criterion,
        status: "NOT_VERIFIED" as const,
        evidence: "Codex 완료 보고에 정확히 일치하는 Acceptance Criteria 증거가 없습니다.",
      },
  );
  const acceptanceCriteriaMet = acceptanceResults.every((evidence) => evidence.status === "PASSED");
  const metadata = {
    developmentTaskId: input.taskId,
    codexRunId: input.runId,
    commitSha: input.commitSha,
  } as Prisma.InputJsonValue;
  const effectiveTestStatus =
    input.pipeline.testStatus === "PASSED" && acceptanceCriteriaMet ? "PASSED" : "FAILED";
  const testReport = await storePipelineArtifact({
    projectId: input.projectId,
    actorId: input.actorId,
    kind: "TEST_REPORT",
    logicalFolder: "06 Test Reports",
    artifact: jsonArtifact("android-test-report.json", {
      commitSha: input.commitSha,
      status: effectiveTestStatus,
      acceptanceCriteriaMet,
      acceptanceEvidence: acceptanceResults,
      steps: input.pipeline.steps.filter((step) => step.suite === "TEST"),
    }),
    metadata,
  });
  const securityReport = await storePipelineArtifact({
    projectId: input.projectId,
    actorId: input.actorId,
    kind: "SECURITY_REPORT",
    logicalFolder: "07 Security Reports",
    artifact: jsonArtifact("android-security-report.json", {
      commitSha: input.commitSha,
      status: input.pipeline.securityStatus,
      steps: input.pipeline.steps.filter((step) => step.suite === "SECURITY"),
      findings: input.pipeline.findings,
    }),
    metadata,
  });
  const sbom = input.pipeline.sbom
    ? await storePipelineArtifact({
        projectId: input.projectId,
        actorId: input.actorId,
        kind: "SBOM",
        logicalFolder: "07 Security Reports",
        artifact: input.pipeline.sbom,
        metadata,
      })
    : null;
  const buildArtifact = input.pipeline.buildArtifact
    ? await storePipelineArtifact({
        projectId: input.projectId,
        actorId: input.actorId,
        kind: input.pipeline.buildArtifact.name.toLowerCase().endsWith(".aab") ? "AAB" : "APK",
        logicalFolder: "08 Builds",
        artifact: input.pipeline.buildArtifact,
        metadata,
      })
    : null;
  const testSteps = input.pipeline.steps.filter((step) => step.suite === "TEST");
  const securitySteps = input.pipeline.steps.filter((step) => step.suite === "SECURITY");
  const [testRun, securityScan, build] = await prisma.$transaction([
    prisma.testRun.create({
      data: {
        projectId: input.projectId,
        developmentTaskId: input.taskId,
        codexRunId: input.runId,
        commitSha: input.commitSha,
        status: effectiveTestStatus,
        command: testSteps
          .map((step) => step.command)
          .join(" && ")
          .slice(0, 500),
        startedAt: new Date(),
        finishedAt: new Date(),
        summary: {
          source: "FACTORY_ANDROID_PIPELINE",
          total: testSteps.length + input.acceptanceCriteria.length,
          passed:
            testSteps.filter((step) => step.status === "PASSED").length +
            acceptanceResults.filter((item) => item.status === "PASSED").length,
          failed:
            testSteps.filter((step) => step.status === "FAILED").length +
            acceptanceResults.filter((item) => item.status === "FAILED").length,
          skipped: acceptanceResults.filter((item) => item.status === "NOT_VERIFIED").length,
          acceptanceCriteriaMet,
        },
        reportArtifactId: testReport.artifactId,
        results: {
          create: [
            ...testSteps.map((step) => ({
              suite: "Factory Android Pipeline",
              name: step.name,
              status: step.status,
              durationMs: step.durationMs,
              message: step.message,
            })),
            ...acceptanceResults.map((evidence) => ({
              suite: "Acceptance Criteria",
              name: evidence.criterion.slice(0, 1000),
              status:
                evidence.status === "NOT_VERIFIED"
                  ? "SKIPPED"
                  : evidence.status === "PASSED"
                    ? "PASSED"
                    : "FAILED",
              message: evidence.evidence,
            })),
          ],
        },
      },
    }),
    prisma.securityScan.create({
      data: {
        projectId: input.projectId,
        developmentTaskId: input.taskId,
        commitSha: input.commitSha,
        scanner: "FACTORY_ANDROID_PIPELINE",
        status: input.pipeline.securityStatus,
        startedAt: new Date(),
        finishedAt: new Date(),
        summary: {
          tools: securitySteps.map((step) => ({
            name: step.name,
            status: step.status,
            durationMs: step.durationMs,
          })),
          findingCount: input.pipeline.findings.length,
        },
        sbomArtifactId: sbom?.artifactId ?? null,
        reportArtifactId: securityReport.artifactId,
        findings: {
          create: input.pipeline.findings.map((finding) => ({
            fingerprint: finding.fingerprint,
            severity: finding.severity,
            ruleId: finding.ruleId,
            title: finding.title,
            description: finding.description,
            remediation: finding.remediation,
          })),
        },
      },
    }),
    prisma.build.create({
      data: {
        projectId: input.projectId,
        developmentTaskId: input.taskId,
        commitSha: input.commitSha,
        prdSha256: input.prdSha256,
        status: input.pipeline.buildStatus,
        buildType: input.pipeline.buildArtifact?.name.toLowerCase().endsWith(".aab")
          ? "UNSIGNED_RELEASE_AAB"
          : "DEBUG_APK",
        signed: false,
        artifactVersionId: buildArtifact?.artifactVersionId ?? null,
        artifactSha256: buildArtifact?.sha256 ?? null,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    }),
  ]);
  const openCritical = input.pipeline.findings.filter(
    (finding) => finding.severity === "CRITICAL",
  ).length;
  const openHigh = input.pipeline.findings.filter((finding) => finding.severity === "HIGH").length;
  const gate = evaluateReleaseGate({
    lockedPrd: true,
    commitMatches:
      testRun.commitSha === securityScan.commitSha && testRun.commitSha === build.commitSha,
    prdHashMatches: build.prdSha256 === input.prdSha256,
    testStatus: testRun.status,
    testFailures: testSteps.filter((step) => step.status === "FAILED").length,
    acceptanceCriteriaMet,
    securityStatus: securityScan.status,
    openCritical,
    openHigh,
    sbomPresent: Boolean(sbom),
    buildStatus: build.status,
    buildArtifactPresent: Boolean(buildArtifact),
    buildArtifactHashMatches:
      Boolean(buildArtifact) && buildArtifact?.sha256 === build.artifactSha256,
  });
  const release = await prisma.release.create({
    data: {
      projectId: input.projectId,
      buildId: build.id,
      status: gate.passed ? "CANDIDATE" : "GATE_BLOCKED",
      commitSha: input.commitSha,
      prdVersionId: input.prdId,
      prdSha256: input.prdSha256,
      testRunId: testRun.id,
      securityScanId: securityScan.id,
      gateReport: gate as unknown as Prisma.InputJsonValue,
      createdBy: input.actorId,
    },
  });
  await audit(
    "AUTOMATED_QUALITY_PIPELINE",
    input.projectId,
    input.actorId,
    "Release",
    release.id,
    input.requestId,
    {
      testRunId: testRun.id,
      securityScanId: securityScan.id,
      buildId: build.id,
      gate,
    } as unknown as Prisma.InputJsonValue,
  );
  return {
    gatePassed: gate.passed,
    releaseId: release.id,
    testPassed: effectiveTestStatus === "PASSED",
  };
}

async function processJob(data: FactoryJobData): Promise<WorkerResult> {
  const requestId = `worker:${data.codexRunId}`;
  const task = await prisma.developmentTask.findUniqueOrThrow({
    where: { id: data.developmentTaskId },
  });
  const run = await prisma.codexRun.findUniqueOrThrow({ where: { id: data.codexRunId } });
  const [project, prd, instruction, repository] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: task.projectId } }),
    prisma.prdVersion.findUniqueOrThrow({ where: { id: task.lockedPrdVersionId } }),
    prisma.taskInstructionVersion.findUniqueOrThrow({
      where: { id: run.instructionVersionId },
    }),
    task.targetRepositoryId
      ? prisma.githubRepository.findUniqueOrThrow({ where: { id: task.targetRepositoryId } })
      : Promise.reject(new Error("Task Repository가 지정되지 않았습니다.")),
  ]);
  if (
    prd.status !== "LOCKED" ||
    !prd.lockedAt ||
    prd.sha256 !== task.lockedPrdSha256 ||
    instruction.id !== task.currentInstructionId
  ) {
    throw new Error("잠긴 PRD Hash 또는 현재 지시 버전 검증에 실패했습니다.");
  }
  const [constraintVersions, decisionVersions, lastEvent] = await Promise.all([
    prisma.ceoConstraint.findMany({
      where: { projectId: project.id, status: "ACTIVE", deletedAt: null },
      orderBy: [{ logicalId: "asc" }, { versionNumber: "desc" }],
    }),
    prisma.decisionRecord.findMany({
      where: { projectId: project.id, status: "ACTIVE", deletedAt: null },
      orderBy: [{ logicalId: "asc" }, { versionNumber: "desc" }],
    }),
    prisma.codexRunEvent.aggregate({
      where: { codexRunId: run.id },
      _max: { sequence: true },
    }),
  ]);
  const constraints = latestLogicalVersions(constraintVersions);
  const decisions = latestLogicalVersions(decisionVersions);
  const sequence = { value: lastEvent._max.sequence ?? 0 };
  const runRoot = safeWorkspace(project.id, task.id, run.id);
  const repositoryPath = join(runRoot, "repository");
  const outputDirectory = join(runRoot, "output");
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const github = createGithubAdapter();
  const codex = createCodexAdapter();
  const fake = codex.name === "fake";
  if (fake) {
    await mkdir(repositoryPath, { recursive: true, mode: 0o700 });
  } else {
    validateGitRef(task.targetBranch);
    const authorizationHeader = await github.cloneAuthorizationHeader();
    const cloneUrl = validateGithubUrl(repository.htmlUrl);
    const workspaceState = await inspectRepositoryWorkspace(repositoryPath);
    if (workspaceState === "INVALID") {
      throw new Error(
        `Codex workspace is non-empty but is not a reusable Git repository: ${repositoryPath}`,
      );
    }
    if (workspaceState === "REUSABLE") {
      const origin = (
        await runGit(["config", "--get", "remote.origin.url"], repositoryPath)
      ).stdout.trim();
      if (validateGithubUrl(origin) !== cloneUrl) {
        throw new Error("Existing Codex workspace origin does not match the task repository");
      }
      await addEvent(
        run.id,
        sequence,
        "workspace.reused",
        "이전 시도에서 보존한 Git 작업공간을 재사용합니다.",
      );
    } else {
      await runGit(
        [
          "clone",
          "--no-tags",
          "--depth",
          "50",
          "--branch",
          task.targetBranch,
          cloneUrl,
          repositoryPath,
        ],
        dirname(repositoryPath),
        { ...(authorizationHeader ? { authorizationHeader } : {}) },
      );
    }
    if (task.targetCommitSha) {
      await runGit(["checkout", "--detach", task.targetCommitSha], repositoryPath);
      const checkedOut = (await runGit(["rev-parse", "HEAD"], repositoryPath)).stdout.trim();
      if (checkedOut.toLowerCase() !== task.targetCommitSha.toLowerCase()) {
        throw new Error("Checkout Commit SHA가 작업 요청과 일치하지 않습니다.");
      }
    }
  }
  const testCommands = (process.env.CODEX_ALLOWED_TEST_COMMANDS ?? "")
    .split(",")
    .map((command) => command.trim())
    .filter(Boolean);
  const prompt = buildCodexPrompt({
    project: { id: project.id, name: project.name, summary: project.summary },
    lockedPrd: {
      id: prd.id,
      versionNumber: prd.versionNumber,
      sha256: prd.sha256,
      content: prd.contentMarkdown ?? JSON.stringify(prd.contentJson, null, 2),
      acceptanceCriteria: jsonStringArray(prd.acceptanceCriteria),
    },
    constraints,
    decisions,
    task: {
      id: task.id,
      type: task.type,
      title: task.title,
      instruction: instruction.instruction,
      acceptanceCriteria: jsonStringArray(task.acceptanceCriteria),
    },
    repository: {
      owner: repository.owner,
      name: repository.name,
      targetBranch: task.targetBranch,
      ...(task.targetCommitSha ? { targetCommitSha: task.targetCommitSha } : {}),
    },
    allowedPaths: jsonStringArray(task.allowedPaths),
    deniedPaths: jsonStringArray(task.deniedPaths),
    testCommands,
  });
  await prisma.$transaction([
    prisma.developmentTask.update({
      where: { id: task.id },
      data: { status: "RUNNING", version: { increment: 1 } },
    }),
    prisma.codexRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        adapter: codex.name,
        promptSha256: prompt.sha256,
        workspacePath: repositoryPath,
        startedAt: new Date(),
        version: { increment: 1 },
      },
    }),
  ]);
  await transitionProject(
    project.id,
    "DEVELOPING",
    task.createdBy,
    task.id,
    requestId,
    `Codex 실행 시작: ${task.title}`,
  );
  await addEvent(run.id, sequence, "worker.started", "전용 Workspace와 실행 경계를 준비했습니다.");
  await audit("CODEX_RUN", project.id, task.createdBy, "CodexRun", run.id, requestId, {
    adapter: codex.name,
    promptSha256: prompt.sha256,
  });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Codex execution timed out")),
    jobTimeoutMs,
  );
  timeout.unref();
  const cancellationPoll = setInterval(() => {
    void prisma.developmentTask
      .findUnique({ where: { id: task.id }, select: { cancellationRequestedAt: true } })
      .then((current) => {
        if (current?.cancellationRequestedAt) {
          controller.abort(new Error("Codex execution cancelled by user"));
        }
      });
  }, 1_000);
  cancellationPoll.unref();
  let executionSucceeded = false;
  let userCancelled = false;
  try {
    const output = await codex.execute(
      {
        prompt: prompt.prompt,
        workspacePath: repositoryPath,
        outputSchemaPath: resolve(
          process.env.CODEX_RESULT_SCHEMA_PATH ??
            join(process.cwd(), "schemas/codex/codex-result.schema.json"),
        ),
        outputPath: join(outputDirectory, "codex-result.json"),
        acceptanceCriteria: jsonStringArray(task.acceptanceCriteria),
        signal: controller.signal,
      },
      (event) =>
        addEvent(run.id, sequence, event.type, event.message, event.payload, event.level ?? "INFO"),
    );
    if (output.result.status !== "SUCCEEDED") {
      throw new Error(
        `Codex가 작업을 완료하지 못했습니다: ${output.result.status} ${output.result.summary}`,
      );
    }
    let diff = [
      "diff --git a/app/src/main/java/work/sandeul/factory/FakeFeature.kt b/app/src/main/java/work/sandeul/factory/FakeFeature.kt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/app/src/main/java/work/sandeul/factory/FakeFeature.kt",
      "@@ -0,0 +1 @@",
      "+// FakeCodexAdapter E2E artifact",
    ].join("\n");
    let commitSha = sha256(`${task.id}:${run.id}:${prompt.sha256}`).slice(0, 40);
    const workBranch = `factory/task-${task.id.slice(0, 8)}-${run.id.slice(0, 8)}`;
    validateGitRef(workBranch);
    if (!fake) {
      const status = await runGit(["status", "--porcelain=v1", "-z"], repositoryPath);
      const paths = changedPaths(status.stdout);
      enforcePathPolicy(
        paths,
        jsonStringArray(task.allowedPaths),
        jsonStringArray(task.deniedPaths),
      );
      await runGit(["add", "-N", "."], repositoryPath, { allowFailure: true });
      diff = (await runGit(["diff", "--binary", "--no-ext-diff"], repositoryPath)).stdout;
      if (!paths.length) throw new Error("Codex가 변경한 파일이 없습니다.");
      await runGit(["config", "user.name", "Sandeul Factory Worker"], repositoryPath);
      await runGit(["config", "user.email", "factory@sandeul.work"], repositoryPath);
      await runGit(["add", "--all"], repositoryPath);
      await runGit(["commit", "-m", `factory: ${task.title}`], repositoryPath);
      commitSha = (await runGit(["rev-parse", "HEAD"], repositoryPath)).stdout.trim();
      const authorizationHeader = await github.cloneAuthorizationHeader();
      await runGit(["push", "origin", `HEAD:refs/heads/${workBranch}`], repositoryPath, {
        ...(authorizationHeader ? { authorizationHeader } : {}),
      });
      await audit("GIT_PUSH", project.id, task.createdBy, "CodexRun", run.id, requestId, {
        commitSha,
        branch: workBranch,
      });
    }
    const pipeline = await runAndroidPipeline({
      repositoryPath,
      outputDirectory,
      fake,
      signal: controller.signal,
      onEvent: (type, message, payload, level) =>
        addEvent(run.id, sequence, type, message, payload, level ?? "INFO"),
    });
    const pullRequest = await github.createPullRequest(
      repository.owner,
      repository.name,
      `[Factory] ${task.title}`,
      [
        `Locked PRD SHA-256: \`${prd.sha256}\``,
        `Task: \`${task.id}\``,
        "",
        output.result.summary,
        "",
        "자동 병합하지 않습니다. Factory CEO 승인이 필요합니다.",
      ].join("\n"),
      workBranch,
      repository.defaultBranch,
    );
    await prisma.$transaction([
      prisma.codexRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          exitCode: output.exitCode,
          resultJson: output.result,
          finalMessage: output.finalMessage,
          gitDiff: diff.slice(0, 10_000_000),
          commitSha,
          pullRequestNumber: pullRequest.number,
          pullRequestUrl: pullRequest.htmlUrl,
          version: { increment: 1 },
        },
      }),
      prisma.developmentTask.update({
        where: { id: task.id },
        data: { status: "SUCCEEDED", version: { increment: 1 } },
      }),
    ]);
    await addEvent(
      run.id,
      sequence,
      "pull_request.created",
      `Pull Request #${pullRequest.number}가 생성되었습니다.`,
      { url: pullRequest.htmlUrl, commitSha },
    );
    await transitionProject(
      project.id,
      "CODE_REVIEW",
      task.createdBy,
      task.id,
      requestId,
      `Codex 작업 완료 및 PR #${pullRequest.number} 생성`,
    );
    await audit("PULL_REQUEST_CREATE", project.id, task.createdBy, "CodexRun", run.id, requestId, {
      number: pullRequest.number,
      url: pullRequest.htmlUrl,
      commitSha,
    });
    const quality = await recordPipelineResult({
      projectId: project.id,
      taskId: task.id,
      runId: run.id,
      actorId: task.createdBy,
      commitSha,
      prdId: prd.id,
      prdSha256: prd.sha256,
      acceptanceCriteria: jsonStringArray(task.acceptanceCriteria),
      acceptanceEvidence: output.result.acceptanceCriteria,
      pipeline,
      requestId,
    });
    if (quality.testPassed) {
      await transitionProject(
        project.id,
        "QA_TESTING",
        task.createdBy,
        task.id,
        requestId,
        "독립 테스트와 Acceptance Criteria 검증 완료",
      );
    }
    if (quality.testPassed && pipeline.securityStatus === "PASSED") {
      await transitionProject(
        project.id,
        "SECURITY_REVIEW",
        task.createdBy,
        task.id,
        requestId,
        "Android 보안검사와 SBOM 생성 완료",
      );
    }
    if (quality.gatePassed) {
      await transitionProject(
        project.id,
        "RELEASE_CANDIDATE",
        task.createdBy,
        task.id,
        requestId,
        `자동 Release Gate 통과: ${quality.releaseId}`,
      );
    }
    await addEvent(
      run.id,
      sequence,
      quality.gatePassed ? "release_gate.passed" : "release_gate.blocked",
      quality.gatePassed
        ? "테스트·보안검사·SBOM·빌드 Gate를 통과해 CEO Release Candidate 승인 대기 상태가 되었습니다."
        : "자동 품질 파이프라인은 완료됐지만 Release Gate가 차단되었습니다.",
      { releaseId: quality.releaseId },
      quality.gatePassed ? "INFO" : "WARN",
    );
    executionSucceeded = true;
    return { commitSha, pullRequestUrl: pullRequest.htmlUrl };
  } catch (error) {
    const cancelled =
      controller.signal.aborted &&
      (
        await prisma.developmentTask.findUnique({
          where: { id: task.id },
          select: { cancellationRequestedAt: true },
        })
      )?.cancellationRequestedAt;
    if (cancelled) {
      userCancelled = true;
      await prisma.$transaction([
        prisma.codexRun.update({
          where: { id: run.id },
          data: {
            status: "CANCELLED",
            finishedAt: new Date(),
            errorCode: "USER_CANCELLED",
            errorMessage: "사용자 요청으로 실행이 중단되었습니다.",
            version: { increment: 1 },
          },
        }),
        prisma.developmentTask.update({
          where: { id: task.id },
          data: { status: "CANCELLED", version: { increment: 1 } },
        }),
      ]);
      await addEvent(run.id, sequence, "run.cancelled", "사용자 요청으로 실행이 중단되었습니다.");
      return { cancelled: true };
    }
    await addEvent(
      run.id,
      sequence,
      "run.failed",
      error instanceof Error ? error.message : "Worker execution failed",
      undefined,
      "ERROR",
    );
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(cancellationPoll);
    if (
      shouldCleanupWorkspace({
        cleanupEnabled: (process.env.CODEX_WORKSPACE_CLEANUP ?? "true") === "true",
        executionSucceeded,
        userCancelled,
      })
    ) {
      const root = resolve(process.env.CODEX_WORKSPACE_ROOT ?? "/srv/factory-workspaces");
      try {
        await cleanupRunWorkspace(root, runRoot);
      } catch (cleanupError) {
        await addEvent(
          run.id,
          sequence,
          "workspace.cleanup_failed",
          cleanupError instanceof Error ? cleanupError.message : "Workspace cleanup failed",
          undefined,
          "WARN",
        ).catch(() => undefined);
      }
    }
  }
}

const worker = new Worker<FactoryJobData, WorkerResult>(
  queueName,
  async (job) => {
    await prisma.job.update({
      where: { id: job.data.jobRecordId },
      data: {
        externalJobId: String(job.id),
        status: "RUNNING",
        startedAt: new Date(),
        attempts: { increment: 1 },
        version: { increment: 1 },
      },
    });
    return processJob(job.data);
  },
  {
    connection,
    concurrency,
    lockDuration: jobTimeoutMs,
  },
);

worker.on("completed", (job, result) => {
  void prisma.job.update({
    where: { id: job.data.jobRecordId },
    data: {
      status: result.cancelled ? "CANCELLED" : "SUCCEEDED",
      finishedAt: new Date(),
      version: { increment: 1 },
    },
  });
});

worker.on("failed", (job, error) => {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? Number(process.env.CODEX_JOB_MAX_ATTEMPTS ?? 3);
  const exhausted = job.attemptsMade >= maxAttempts;
  void prisma.$transaction([
    prisma.job.update({
      where: { id: job.data.jobRecordId },
      data: {
        status: exhausted ? "DEAD_LETTER" : "RETRYING",
        lastError: error.message.slice(0, 4000),
        ...(exhausted ? { finishedAt: new Date() } : {}),
        version: { increment: 1 },
      },
    }),
    prisma.developmentTask.update({
      where: { id: job.data.developmentTaskId },
      data: {
        status: exhausted ? "DEAD_LETTER" : "QUEUED",
        version: { increment: 1 },
      },
    }),
    prisma.codexRun.update({
      where: { id: job.data.codexRunId },
      data: {
        status: exhausted ? "FAILED" : "QUEUED",
        errorCode: exhausted ? "EXECUTION_FAILED" : "RETRY_SCHEDULED",
        errorMessage: error.message.slice(0, 4000),
        ...(exhausted ? { finishedAt: new Date() } : {}),
        version: { increment: 1 },
      },
    }),
  ]);
});

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(`Worker shutdown requested: ${signal}\n`);
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.stdout.write(`Codex worker listening queue=${queueName} concurrency=${concurrency}\n`);
