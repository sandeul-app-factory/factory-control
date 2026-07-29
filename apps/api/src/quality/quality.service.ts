import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type BuildReportInput,
  type SecurityScanReportInput,
  type TestRunReportInput,
} from "@sandeul/contracts";
import { Prisma, prisma } from "@sandeul/database";
import { evaluateReleaseGate, type ReleaseGateReport } from "@sandeul/security";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { StubSigningWorker } from "./signing-worker.js";

interface ReleaseSelection {
  buildId: string;
  testRunId: string;
  securityScanId: string;
}

interface RiskAcceptanceInput {
  projectId: string;
  securityFindingId: string;
  reason: string;
  expiresAt?: string | undefined;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function date(value: string | undefined, fallback: Date): Date {
  return value ? new Date(value) : fallback;
}

@Injectable()
export class QualityService {
  private readonly signingWorker = new StubSigningWorker();

  constructor(
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  overview() {
    return Promise.all([
      prisma.testRun.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.securityScan.findMany({
        include: { findings: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.build.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.release.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]).then(([tests, scans, builds, releases]) => ({ tests, scans, builds, releases }));
  }

  async listTests(projectId: string) {
    await this.projects.get(projectId);
    return prisma.testRun.findMany({
      where: { projectId },
      include: { results: { orderBy: [{ suite: "asc" }, { name: "asc" }] } },
      orderBy: { createdAt: "desc" },
    });
  }

  async recordTest(
    projectId: string,
    input: TestRunReportInput,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const project = await this.projects.get(projectId);
    await this.validateArtifact(projectId, input.reportArtifactId, ["TEST_REPORT"]);
    await this.validateTask(projectId, input.developmentTaskId);
    if (input.codexRunId) {
      const run = await prisma.codexRun.findFirst({
        where: { id: input.codexRunId },
      });
      const runTask = run
        ? await prisma.developmentTask.findFirst({
            where: { id: run.developmentTaskId, projectId, deletedAt: null },
          })
        : null;
      if (!run || !runTask) {
        throw new BadRequestException("프로젝트에 속한 Codex 실행이 아닙니다.");
      }
    }
    if (
      input.status === "PASSED" &&
      (input.summary.failed > 0 || input.results.some((result) => result.status === "FAILED"))
    ) {
      throw new BadRequestException("실패 결과가 있는 Test Run은 PASSED로 기록할 수 없습니다.");
    }
    const now = new Date();
    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        developmentTaskId: input.developmentTaskId ?? null,
        codexRunId: input.codexRunId ?? null,
        commitSha: input.commitSha.toLowerCase(),
        status: input.status,
        command: input.command,
        startedAt: date(input.startedAt, now),
        finishedAt: date(input.finishedAt, now),
        summary: json(input.summary),
        reportArtifactId: input.reportArtifactId ?? null,
        results: {
          create: input.results.map((result) => ({
            suite: result.suite,
            name: result.name,
            status: result.status,
            durationMs: result.durationMs ?? null,
            message: result.message ?? null,
          })),
        },
      },
      include: { results: true },
    });
    if (input.status === "PASSED" && project.status === "CODE_REVIEW") {
      await this.projects.transitionSystem(
        projectId,
        "QA_TESTING",
        "통과한 Test Run 기록",
        actor,
        request,
        input.developmentTaskId ? { taskId: input.developmentTaskId } : {},
      );
    }
    await this.audit.record({
      actor,
      action: "TEST_RUN_RECORD",
      resourceType: "TestRun",
      resourceId: testRun.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { status: input.status, commitSha: input.commitSha, summary: input.summary },
    });
    return testRun;
  }

  async listSecurityScans(projectId: string) {
    await this.projects.get(projectId);
    const scans = await prisma.securityScan.findMany({
      where: { projectId },
      include: { findings: { orderBy: [{ severity: "asc" }, { createdAt: "desc" }] } },
      orderBy: { createdAt: "desc" },
    });
    const findingIds = scans.flatMap((scan) => scan.findings.map((finding) => finding.id));
    const acceptances = findingIds.length
      ? await prisma.riskAcceptance.findMany({
          where: { securityFindingId: { in: findingIds }, revokedAt: null },
          orderBy: { createdAt: "desc" },
        })
      : [];
    return scans.map((scan) => ({
      ...scan,
      findings: scan.findings.map((finding) => ({
        ...finding,
        riskAcceptance:
          acceptances.find((acceptance) => acceptance.securityFindingId === finding.id) ?? null,
      })),
    }));
  }

  async recordSecurityScan(
    projectId: string,
    input: SecurityScanReportInput,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const project = await this.projects.get(projectId);
    await this.validateTask(projectId, input.developmentTaskId);
    await Promise.all([
      this.validateArtifact(projectId, input.reportArtifactId, ["SECURITY_REPORT"]),
      this.validateArtifact(projectId, input.sbomArtifactId, ["SBOM"]),
    ]);
    const now = new Date();
    const scan = await prisma.securityScan.create({
      data: {
        projectId,
        developmentTaskId: input.developmentTaskId ?? null,
        commitSha: input.commitSha.toLowerCase(),
        scanner: input.scanner,
        status: input.status,
        startedAt: date(input.startedAt, now),
        finishedAt: date(input.finishedAt, now),
        sbomArtifactId: input.sbomArtifactId ?? null,
        reportArtifactId: input.reportArtifactId ?? null,
        summary: json({
          findingCount: input.findings.length,
          bySeverity: input.findings.reduce<Record<string, number>>((counts, finding) => {
            counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
            return counts;
          }, {}),
        }),
        findings: {
          create: input.findings.map((finding) => ({
            fingerprint: finding.fingerprint,
            severity: finding.severity,
            ruleId: finding.ruleId,
            title: finding.title,
            description: finding.description,
            filePath: finding.filePath ?? null,
            line: finding.line ?? null,
            remediation: finding.remediation ?? null,
          })),
        },
      },
      include: { findings: true },
    });
    if (input.status === "PASSED" && project.status === "QA_TESTING") {
      await this.projects.transitionSystem(
        projectId,
        "SECURITY_REVIEW",
        "완료된 보안검사 기록",
        actor,
        request,
        input.developmentTaskId ? { taskId: input.developmentTaskId } : {},
      );
    }
    await this.audit.record({
      actor,
      action: "SECURITY_SCAN_RECORD",
      resourceType: "SecurityScan",
      resourceId: scan.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: {
        scanner: input.scanner,
        status: input.status,
        commitSha: input.commitSha,
        findings: input.findings.length,
        sbomArtifactId: input.sbomArtifactId,
      },
    });
    return scan;
  }

  async acceptRisk(
    projectId: string,
    input: RiskAcceptanceInput,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const finding = await prisma.securityFinding.findFirst({
      where: { id: input.securityFindingId, securityScan: { projectId } },
    });
    if (!finding) throw new NotFoundException("보안 Finding을 찾을 수 없습니다.");
    if (finding.severity === "CRITICAL") {
      throw new BadRequestException("CRITICAL 위험은 정책상 수용할 수 없습니다.");
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException("위험 수용 만료일은 미래여야 합니다.");
    }
    const existing = await prisma.riskAcceptance.findFirst({
      where: { projectId, securityFindingId: finding.id, revokedAt: null },
    });
    if (existing) throw new ConflictException("이미 활성 위험 수용 기록이 있습니다.");
    const acceptance = await prisma.$transaction(async (transaction) => {
      const created = await transaction.riskAcceptance.create({
        data: {
          projectId,
          securityFindingId: finding.id,
          reason: input.reason,
          expiresAt,
          acceptedBy: actor.userId,
        },
      });
      await transaction.securityFinding.update({
        where: { id: finding.id },
        data: { status: "RISK_ACCEPTED", version: { increment: 1 } },
      });
      return created;
    });
    await this.audit.record({
      actor,
      action: "RISK_ACCEPT",
      resourceType: "SecurityFinding",
      resourceId: finding.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      reason: input.reason,
      metadata: { severity: finding.severity, expiresAt },
    });
    return acceptance;
  }

  async listBuilds(projectId: string) {
    await this.projects.get(projectId);
    return prisma.build.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  }

  async recordBuild(
    projectId: string,
    input: BuildReportInput,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    await this.projects.get(projectId);
    await this.validateTask(projectId, input.developmentTaskId);
    if (input.buildType === "SIGNED_RELEASE") {
      throw new BadRequestException("서명 빌드는 별도 Signing Worker만 기록할 수 있습니다.");
    }
    const lockedPrd = await this.lockedPrd(projectId);
    const artifact = await this.validateArtifactVersion(projectId, input.artifactVersionId, [
      "APK",
      "AAB",
    ]);
    if (input.status === "SUCCEEDED" && !artifact) {
      throw new BadRequestException("성공한 빌드에는 검증된 APK 또는 AAB가 필요합니다.");
    }
    const now = new Date();
    const build = await prisma.build.create({
      data: {
        projectId,
        developmentTaskId: input.developmentTaskId ?? null,
        commitSha: input.commitSha.toLowerCase(),
        prdSha256: lockedPrd.sha256,
        status: input.status,
        buildType: input.buildType,
        signed: false,
        artifactVersionId: artifact?.id ?? null,
        artifactSha256: artifact?.sha256 ?? null,
        startedAt: date(input.startedAt, now),
        finishedAt: date(input.finishedAt, now),
      },
    });
    await this.audit.record({
      actor,
      action: "BUILD_RECORD",
      resourceType: "Build",
      resourceId: build.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: {
        status: build.status,
        buildType: build.buildType,
        commitSha: build.commitSha,
        artifactSha256: build.artifactSha256,
        signed: false,
      },
    });
    return build;
  }

  async listReleases(projectId: string) {
    await this.projects.get(projectId);
    return prisma.release.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async releaseGate(projectId: string, selection: ReleaseSelection): Promise<ReleaseGateReport> {
    await this.projects.get(projectId);
    const [lockedPrd, build, testRun, securityScan] = await Promise.all([
      this.lockedPrd(projectId),
      prisma.build.findFirst({ where: { id: selection.buildId, projectId } }),
      prisma.testRun.findFirst({
        where: { id: selection.testRunId, projectId },
        include: { results: true },
      }),
      prisma.securityScan.findFirst({
        where: { id: selection.securityScanId, projectId },
        include: { findings: true },
      }),
    ]);
    if (!build || !testRun || !securityScan) {
      throw new BadRequestException("Release Gate 입력이 이 프로젝트에 속하지 않습니다.");
    }
    const buildArtifact = await this.validateArtifactVersion(
      projectId,
      build.artifactVersionId ?? undefined,
      ["APK", "AAB"],
    );
    const sbom = await this.validateArtifact(projectId, securityScan.sbomArtifactId ?? undefined, [
      "SBOM",
    ]);
    const highRiskAccepted = await this.activeAcceptedFindingIds(
      projectId,
      securityScan.findings
        .filter((finding) => finding.severity === "HIGH")
        .map((finding) => finding.id),
    );
    const summary =
      testRun.summary && typeof testRun.summary === "object" && !Array.isArray(testRun.summary)
        ? (testRun.summary as Record<string, unknown>)
        : {};
    const report = evaluateReleaseGate({
      lockedPrd: lockedPrd.status === "LOCKED",
      commitMatches:
        build.commitSha === testRun.commitSha && build.commitSha === securityScan.commitSha,
      prdHashMatches: build.prdSha256 === lockedPrd.sha256,
      testStatus: testRun.status,
      testFailures: testRun.results.filter((result) => result.status === "FAILED").length,
      acceptanceCriteriaMet: summary.acceptanceCriteriaMet === true,
      securityStatus: securityScan.status,
      openCritical: securityScan.findings.filter(
        (finding) =>
          finding.severity === "CRITICAL" &&
          finding.status !== "FIXED" &&
          finding.status !== "FALSE_POSITIVE",
      ).length,
      openHigh: securityScan.findings.filter(
        (finding) =>
          finding.severity === "HIGH" &&
          finding.status !== "FIXED" &&
          finding.status !== "FALSE_POSITIVE" &&
          !highRiskAccepted.has(finding.id),
      ).length,
      sbomPresent: Boolean(sbom),
      buildStatus: build.status,
      buildArtifactPresent: Boolean(buildArtifact),
      buildArtifactHashMatches:
        Boolean(buildArtifact) && buildArtifact?.sha256 === build.artifactSha256,
    });
    return {
      ...report,
      inputs: {
        projectId,
        prdVersionId: lockedPrd.id,
        prdSha256: lockedPrd.sha256,
        commitSha: build.commitSha,
        buildId: build.id,
        testRunId: testRun.id,
        securityScanId: securityScan.id,
      },
    } as ReleaseGateReport;
  }

  async createReleaseCandidate(
    projectId: string,
    selection: ReleaseSelection,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const project = await this.projects.get(projectId);
    if (project.status !== "SECURITY_REVIEW") {
      throw new ConflictException(
        "SECURITY_REVIEW 상태에서만 Release Candidate를 만들 수 있습니다.",
      );
    }
    const [gate, lockedPrd, build] = await Promise.all([
      this.releaseGate(projectId, selection),
      this.lockedPrd(projectId),
      prisma.build.findFirstOrThrow({ where: { id: selection.buildId, projectId } }),
    ]);
    const release = await prisma.release.create({
      data: {
        projectId,
        buildId: build.id,
        status: gate.passed ? "CANDIDATE" : "GATE_BLOCKED",
        commitSha: build.commitSha,
        prdVersionId: lockedPrd.id,
        prdSha256: lockedPrd.sha256,
        testRunId: selection.testRunId,
        securityScanId: selection.securityScanId,
        gateReport: json(gate),
        createdBy: actor.userId,
      },
    });
    await this.audit.record({
      actor,
      action: "RELEASE_CANDIDATE_CREATE",
      resourceType: "Release",
      resourceId: release.id,
      projectId,
      requestId: request.requestId,
      outcome: gate.passed ? "SUCCESS" : "DENIED",
      reason: gate.passed ? "Release Gate 통과" : gate.blockers.join(" "),
      metadata: { gate },
    });
    if (!gate.passed) return release;
    await this.projects.transitionSystem(
      projectId,
      "RELEASE_CANDIDATE",
      "Release Gate 통과",
      actor,
      request,
    );
    return release;
  }

  async approveRelease(
    releaseId: string,
    input: { reason: string },
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const release = await prisma.release.findFirst({
      where: { id: releaseId, deletedAt: null },
    });
    if (!release) throw new NotFoundException("Release를 찾을 수 없습니다.");
    if (release.status !== "CANDIDATE") {
      throw new ConflictException("CANDIDATE 상태의 Release만 승인할 수 있습니다.");
    }
    const gate = await this.releaseGate(release.projectId, {
      buildId: release.buildId,
      testRunId: release.testRunId,
      securityScanId: release.securityScanId,
    });
    if (!gate.passed) {
      await prisma.release.update({
        where: { id: release.id },
        data: { status: "GATE_BLOCKED", gateReport: json(gate), version: { increment: 1 } },
      });
      throw new ConflictException(gate.blockers);
    }
    const updated = await prisma.release.updateMany({
      where: { id: release.id, status: "CANDIDATE", version: release.version },
      data: {
        status: "APPROVED",
        approvedBy: actor.userId,
        approvedAt: new Date(),
        gateReport: json(gate),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException("Release가 다른 요청에서 변경되었습니다.");
    }
    await this.projects.transitionSystem(
      release.projectId,
      "FINAL_APPROVAL",
      input.reason,
      actor,
      request,
    );
    await this.audit.record({
      actor,
      action: "RELEASE_APPROVE",
      resourceType: "Release",
      resourceId: release.id,
      projectId: release.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      reason: input.reason,
      metadata: { commitSha: release.commitSha, prdSha256: release.prdSha256, gate },
    });
    return prisma.release.findUniqueOrThrow({ where: { id: release.id } });
  }

  async requestSigning(releaseId: string, actor: RequestAuth, request: FactoryRequest) {
    const release = await prisma.release.findFirst({
      where: { id: releaseId, deletedAt: null },
    });
    if (!release) throw new NotFoundException("Release를 찾을 수 없습니다.");
    if (release.status !== "APPROVED") {
      throw new ConflictException("최종 승인된 Release만 서명을 요청할 수 있습니다.");
    }
    const gate = await this.releaseGate(release.projectId, {
      buildId: release.buildId,
      testRunId: release.testRunId,
      securityScanId: release.securityScanId,
    });
    if (!gate.passed) throw new ConflictException(gate.blockers);
    const build = await prisma.build.findUniqueOrThrow({ where: { id: release.buildId } });
    if (!build.artifactSha256) throw new ConflictException("검증된 빌드 SHA-256이 없습니다.");
    const result = await this.signingWorker.sign({
      releaseId: release.id,
      commitSha: release.commitSha,
      prdSha256: release.prdSha256,
      testRunId: release.testRunId,
      securityScanId: release.securityScanId,
      buildSha256: build.artifactSha256,
    });
    await this.audit.record({
      actor,
      action: "SIGNING_REQUEST",
      resourceType: "Release",
      resourceId: release.id,
      projectId: release.projectId,
      requestId: request.requestId,
      outcome: "DENIED",
      reason: result.message,
      metadata: {
        configured: result.configured,
        commitSha: release.commitSha,
        prdSha256: release.prdSha256,
        buildSha256: build.artifactSha256,
      },
    });
    return result;
  }

  private async lockedPrd(projectId: string) {
    const prd = await prisma.prdVersion.findFirst({
      where: { projectId, status: "LOCKED", deletedAt: null },
      orderBy: { versionNumber: "desc" },
    });
    if (!prd) throw new ConflictException("잠긴 PRD가 없습니다.");
    return prd;
  }

  private async validateArtifact(
    projectId: string,
    artifactId: string | undefined,
    kinds: Array<"TEST_REPORT" | "SECURITY_REPORT" | "SBOM">,
  ) {
    if (!artifactId) return null;
    const artifact = await prisma.artifact.findFirst({
      where: { id: artifactId, projectId, kind: { in: kinds }, deletedAt: null, status: "ACTIVE" },
    });
    if (!artifact)
      throw new BadRequestException("Artifact 종류 또는 프로젝트가 일치하지 않습니다.");
    return artifact;
  }

  private async validateArtifactVersion(
    projectId: string,
    artifactVersionId: string | undefined,
    kinds: Array<"APK" | "AAB">,
  ) {
    if (!artifactVersionId) return null;
    const version = await prisma.artifactVersion.findFirst({
      where: {
        id: artifactVersionId,
        artifact: {
          projectId,
          kind: { in: kinds },
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      include: { artifact: true },
    });
    if (!version) {
      throw new BadRequestException("빌드 Artifact 종류 또는 프로젝트가 일치하지 않습니다.");
    }
    return version;
  }

  private async activeAcceptedFindingIds(projectId: string, findingIds: string[]) {
    if (!findingIds.length) return new Set<string>();
    const now = new Date();
    const records = await prisma.riskAcceptance.findMany({
      where: {
        projectId,
        securityFindingId: { in: findingIds },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { securityFindingId: true },
    });
    return new Set(records.map((record) => record.securityFindingId));
  }

  private async validateTask(projectId: string, taskId: string | undefined): Promise<void> {
    if (!taskId) return;
    const task = await prisma.developmentTask.findFirst({
      where: { id: taskId, projectId, deletedAt: null },
    });
    if (!task) throw new BadRequestException("프로젝트에 속한 개발 작업이 아닙니다.");
  }
}
