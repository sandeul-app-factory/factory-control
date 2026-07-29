import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@sandeul/database";
import { approvalInputSchema, createCommentSchema, prdJsonSchema } from "@sandeul/contracts";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";
import { ArtifactsService } from "../artifacts/artifacts.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import {
  jsonSections,
  latestByLogicalId,
  markdownSections,
  parseStringArray,
} from "./prd-content.js";

interface UploadPrdInput {
  acceptanceCriteria?: string | undefined;
  includedArtifactIds?: string | undefined;
  excludedScope?: string | undefined;
}

@Injectable()
export class PrdService {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  list(projectId: string) {
    return prisma.prdVersion.findMany({
      where: { projectId, deletedAt: null },
      include: { _count: { select: { sections: true, comments: true } } },
      orderBy: { versionNumber: "desc" },
    });
  }

  async get(prdVersionId: string) {
    const prd = await prisma.prdVersion.findFirst({
      where: { id: prdVersionId, deletedAt: null },
      include: {
        sections: { orderBy: { ordinal: "asc" } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!prd) throw new NotFoundException("PRD 버전을 찾을 수 없습니다.");
    return prd;
  }

  async upload(
    projectId: string,
    file: Express.Multer.File,
    input: UploadPrdInput,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const extension = file.originalname.toLowerCase().split(".").pop();
    if (extension !== "md" && extension !== "json") {
      throw new BadRequestException("Canonical PRD는 .md 또는 schema를 통과한 .json만 가능합니다.");
    }

    const artifact = await this.artifacts.store(
      projectId,
      "PRD",
      "02 Product",
      file,
      actor,
      request,
    );
    const artifactVersion = artifact.versions[0];
    if (!artifactVersion) throw new ConflictException("Artifact 버전을 생성하지 못했습니다.");

    let canonicalFormat: "MARKDOWN" | "JSON";
    let contentMarkdown: string | null = null;
    let contentJson: Prisma.InputJsonValue = {};
    let acceptanceCriteria = parseStringArray(input.acceptanceCriteria, "acceptanceCriteria");
    let sections: ReturnType<typeof markdownSections>;

    if (extension === "json") {
      const raw: unknown = JSON.parse(file.buffer.toString("utf8"));
      const parsed = prdJsonSchema.safeParse(raw);
      if (!parsed.success) {
        throw new BadRequestException({
          message: "PRD JSON Schema 검증에 실패했습니다.",
          issues: parsed.error.issues,
        });
      }
      canonicalFormat = "JSON";
      contentJson = parsed.data as Prisma.InputJsonValue;
      acceptanceCriteria = parsed.data.acceptanceCriteria;
      sections = jsonSections(parsed.data);
    } else {
      canonicalFormat = "MARKDOWN";
      contentMarkdown = file.buffer.toString("utf8").replace(/^\uFEFF/, "");
      if (!contentMarkdown.trim())
        throw new BadRequestException("빈 Markdown PRD는 업로드할 수 없습니다.");
      if (!acceptanceCriteria.length) {
        throw new BadRequestException("Markdown PRD에는 Acceptance Criteria 배열이 필요합니다.");
      }
      sections = markdownSections(contentMarkdown);
    }

    const includedArtifactIds = parseStringArray(input.includedArtifactIds, "includedArtifactIds");
    const excludedScope = parseStringArray(input.excludedScope, "excludedScope");
    const latest = await prisma.prdVersion.aggregate({
      where: { projectId },
      _max: { versionNumber: true },
    });
    const versionNumber = (latest._max.versionNumber ?? 0) + 1;
    const prd = await prisma.prdVersion.create({
      data: {
        projectId,
        versionNumber,
        canonicalFormat,
        contentMarkdown,
        contentJson: canonicalFormat === "MARKDOWN" ? Prisma.JsonNull : contentJson,
        sha256: artifactVersion.sha256,
        sourceArtifactVersionId: artifactVersion.id,
        acceptanceCriteria,
        includedArtifactIds,
        excludedScope,
        createdBy: actor.userId,
        sections: { create: sections },
      },
      include: { sections: { orderBy: { ordinal: "asc" } } },
    });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (
      project.status === "IDEA" ||
      project.status === "RESEARCHING" ||
      project.status === "REVISION_REQUIRED"
    ) {
      await this.projects.transitionSystem(
        projectId,
        "PRD_DRAFT",
        `PRD v${versionNumber} 업로드`,
        actor,
        request,
        { artifactId: artifact.id },
      );
    }
    await this.audit.record({
      actor,
      action: "PRD_VERSION_CREATE",
      resourceType: "PrdVersion",
      resourceId: prd.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { versionNumber, sha256: prd.sha256, canonicalFormat },
    });
    return prd;
  }

  async requestReview(prdVersionId: string, actor: RequestAuth, request: FactoryRequest) {
    const prd = await this.get(prdVersionId);
    if (prd.status !== "DRAFT" && prd.status !== "REVISION_REQUIRED") {
      throw new ConflictException("초안 또는 수정 요청 상태의 PRD만 검토 요청할 수 있습니다.");
    }
    const updated = await prisma.prdVersion.update({
      where: { id: prd.id },
      data: { status: "IN_REVIEW", version: { increment: 1 } },
    });
    await this.projects.transitionSystem(
      prd.projectId,
      "PRD_REVIEW",
      `PRD v${prd.versionNumber} 검토 요청`,
      actor,
      request,
    );
    await this.audit.record({
      actor,
      action: "PRD_REVIEW_REQUEST",
      resourceType: "PrdVersion",
      resourceId: prd.id,
      projectId: prd.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
    });
    return updated;
  }

  async comment(projectId: string, body: unknown, actor: RequestAuth, request: FactoryRequest) {
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const prd = await this.get(parsed.data.prdVersionId);
    if (prd.projectId !== projectId) {
      throw new BadRequestException("PRD와 프로젝트가 일치하지 않습니다.");
    }
    const comment = await prisma.prdComment.create({
      data: {
        projectId,
        prdVersionId: parsed.data.prdVersionId,
        sectionId: parsed.data.sectionId ?? null,
        body: parsed.data.body,
        anchorStart: parsed.data.anchorStart ?? null,
        anchorEnd: parsed.data.anchorEnd ?? null,
        createdBy: actor.userId,
      },
    });
    await this.audit.record({
      actor,
      action: "PRD_COMMENT_CREATE",
      resourceType: "PrdComment",
      resourceId: comment.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
    });
    return comment;
  }

  async approve(prdVersionId: string, body: unknown, actor: RequestAuth, request: FactoryRequest) {
    const parsed = approvalInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const prd = await this.get(prdVersionId);
    if (prd.status !== "IN_REVIEW") {
      throw new ConflictException("검토 중인 PRD만 승인 결정을 기록할 수 있습니다.");
    }

    let prdStatus: "APPROVED" | "REVISION_REQUIRED" | "REJECTED" | "IN_REVIEW" = "IN_REVIEW";
    let projectStatus: "PRD_APPROVED" | "REVISION_REQUIRED" | "REJECTED" | null = null;
    if (parsed.data.action === "APPROVE") {
      prdStatus = "APPROVED";
      projectStatus = "PRD_APPROVED";
    } else if (
      parsed.data.action === "CONDITIONAL_APPROVE" ||
      parsed.data.action === "REQUEST_REVISION"
    ) {
      prdStatus = "REVISION_REQUIRED";
      projectStatus = "REVISION_REQUIRED";
    } else if (parsed.data.action === "REJECT") {
      prdStatus = "REJECTED";
      projectStatus = "REJECTED";
    }

    const [approval] = await prisma.$transaction([
      prisma.approval.create({
        data: {
          projectId: prd.projectId,
          prdVersionId: prd.id,
          action: parsed.data.action,
          title: parsed.data.title,
          detail: parsed.data.detail,
          scope: parsed.data.scope,
          priority: parsed.data.priority,
          mandatory: parsed.data.mandatory,
          effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : null,
          reason: parsed.data.reason,
          createdBy: actor.userId,
        },
      }),
      prisma.prdVersion.update({
        where: { id: prd.id },
        data: {
          status: prdStatus,
          approvedBy: prdStatus === "APPROVED" ? actor.userId : null,
          approvedAt: prdStatus === "APPROVED" ? new Date() : null,
          version: { increment: 1 },
        },
      }),
    ]);
    if (projectStatus) {
      await this.projects.transitionSystem(
        prd.projectId,
        projectStatus,
        `${parsed.data.title}: ${parsed.data.reason}`,
        actor,
        request,
      );
    }
    await this.audit.record({
      actor,
      action: "PRD_APPROVAL",
      resourceType: "Approval",
      resourceId: approval.id,
      projectId: prd.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      reason: parsed.data.reason,
      metadata: { action: parsed.data.action, prdVersionId: prd.id },
    });
    return approval;
  }

  async lock(prdVersionId: string, actor: RequestAuth, request: FactoryRequest) {
    const prd = await this.get(prdVersionId);
    if (prd.status !== "APPROVED" || !prd.approvedAt || !prd.approvedBy) {
      throw new ConflictException("최종 승인된 PRD만 잠글 수 있습니다.");
    }
    const [constraintRecords, decisionRecords] = await Promise.all([
      prisma.ceoConstraint.findMany({
        where: { projectId: prd.projectId, status: "ACTIVE", deletedAt: null },
        orderBy: [{ logicalId: "asc" }, { versionNumber: "desc" }],
      }),
      prisma.decisionRecord.findMany({
        where: { projectId: prd.projectId, status: "ACTIVE", deletedAt: null },
        orderBy: [{ logicalId: "asc" }, { versionNumber: "desc" }],
      }),
    ]);
    const constraints = latestByLogicalId(constraintRecords);
    const decisions = latestByLogicalId(decisionRecords);
    const lockMetadata = {
      prdVersion: prd.versionNumber,
      prdSha256: prd.sha256,
      approvedBy: prd.approvedBy,
      approvedAt: prd.approvedAt.toISOString(),
      lockedBy: actor.userId,
      lockedAt: new Date().toISOString(),
      acceptanceCriteria: prd.acceptanceCriteria,
      includedArtifactIds: prd.includedArtifactIds,
      excludedScope: prd.excludedScope,
    };
    const updated = await prisma.prdVersion.update({
      where: { id: prd.id },
      data: {
        status: "LOCKED",
        lockedBy: actor.userId,
        lockedAt: new Date(),
        constraintSnapshot: constraints as unknown as Prisma.InputJsonValue,
        decisionSnapshot: decisions as unknown as Prisma.InputJsonValue,
        lockMetadata: lockMetadata as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    await this.projects.transitionSystem(
      prd.projectId,
      "PRD_LOCKED",
      `PRD v${prd.versionNumber} 최종 잠금 (${prd.sha256})`,
      actor,
      request,
    );
    await this.audit.record({
      actor,
      action: "PRD_LOCK",
      resourceType: "PrdVersion",
      resourceId: prd.id,
      projectId: prd.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: {
        versionNumber: prd.versionNumber,
        sha256: prd.sha256,
        constraintIds: constraints.map((item) => item.id),
        decisionIds: decisions.map((item) => item.id),
      },
    });
    return updated;
  }

  async diff(fromId: string, toId: string) {
    const [from, to] = await Promise.all([this.get(fromId), this.get(toId)]);
    if (from.projectId !== to.projectId) {
      throw new BadRequestException("같은 프로젝트의 PRD만 비교할 수 있습니다.");
    }
    const left = (from.contentMarkdown ?? JSON.stringify(from.contentJson, null, 2)).split("\n");
    const right = (to.contentMarkdown ?? JSON.stringify(to.contentJson, null, 2)).split("\n");
    if (left.length * right.length > 2_250_000) {
      throw new BadRequestException("온라인 diff 한도를 초과했습니다. 원본 Artifact를 비교하세요.");
    }
    const matrix = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        matrix[i]![j] =
          left[i] === right[j]
            ? (matrix[i + 1]?.[j + 1] ?? 0) + 1
            : Math.max(matrix[i + 1]?.[j] ?? 0, matrix[i]?.[j + 1] ?? 0);
      }
    }
    const changes: Array<{ type: "equal" | "add" | "remove"; line: string }> = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        changes.push({ type: "equal", line: left[i] ?? "" });
        i += 1;
        j += 1;
      } else if ((matrix[i + 1]?.[j] ?? 0) >= (matrix[i]?.[j + 1] ?? 0)) {
        changes.push({ type: "remove", line: left[i] ?? "" });
        i += 1;
      } else {
        changes.push({ type: "add", line: right[j] ?? "" });
        j += 1;
      }
    }
    while (i < left.length) changes.push({ type: "remove", line: left[i++] ?? "" });
    while (j < right.length) changes.push({ type: "add", line: right[j++] ?? "" });
    return { from: from.versionNumber, to: to.versionNumber, changes };
  }
}
