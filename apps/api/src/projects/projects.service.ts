import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@sandeul/database";
import {
  assertProjectTransition,
  createProjectSchema,
  transitionProjectSchema,
} from "@sandeul/contracts";
import type { CreateProjectInput, ProjectStatus, TransitionProjectInput } from "@sandeul/contracts";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";

@Injectable()
export class ProjectsService {
  constructor(private readonly audit: AuditService) {}

  list() {
    return prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(projectId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    const [
      prdVersions,
      artifacts,
      openComments,
      tasks,
      openFindings,
      pendingApprovals,
      repository,
    ] = await Promise.all([
      prisma.prdVersion.count({ where: { projectId, deletedAt: null } }),
      prisma.artifact.count({ where: { projectId, deletedAt: null } }),
      prisma.prdComment.count({ where: { projectId, status: "OPEN", deletedAt: null } }),
      prisma.developmentTask.count({ where: { projectId, deletedAt: null } }),
      prisma.securityFinding.count({
        where: { securityScan: { projectId }, status: "OPEN" },
      }),
      prisma.approval.count({
        where: { projectId, action: { in: ["CONDITIONAL_APPROVE", "REQUEST_REVISION", "HOLD"] } },
      }),
      prisma.githubRepository.findFirst({ where: { projectId, deletedAt: null } }),
    ]);
    return {
      ...project,
      counts: { prdVersions, artifacts, openComments, tasks, openFindings, pendingApprovals },
      repository,
    };
  }

  async create(input: CreateProjectInput, actor: RequestAuth, request: FactoryRequest) {
    const parsed = createProjectSchema.parse(input);
    const project = await prisma.project.create({
      data: { ...parsed, createdBy: actor.userId },
    });
    await prisma.projectStateHistory.create({
      data: {
        projectId: project.id,
        previousStatus: "IDEA",
        newStatus: "IDEA",
        actorId: actor.userId,
        reason: "프로젝트 생성",
        requestId: request.requestId,
      },
    });
    await this.audit.record({
      actor,
      action: "PROJECT_CREATE",
      resourceType: "Project",
      resourceId: project.id,
      projectId: project.id,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { name: project.name, slug: project.slug },
    });
    return project;
  }

  async transition(
    projectId: string,
    input: TransitionProjectInput,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const parsed = transitionProjectSchema.parse(input);
    const current = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!current) throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    assertProjectTransition(current.status as ProjectStatus, parsed.to);

    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.project.updateMany({
        where: { id: projectId, version: parsed.expectedVersion, deletedAt: null },
        data: { status: parsed.to, version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          "다른 사용자가 프로젝트를 변경했습니다. 새로고침 후 재시도하세요.",
        );
      }
      await transaction.projectStateHistory.create({
        data: {
          projectId,
          previousStatus: current.status,
          newStatus: parsed.to,
          actorId: actor.userId,
          reason: parsed.reason,
          artifactId: parsed.artifactId ?? null,
          decisionRecordId: parsed.decisionRecordId ?? null,
          taskId: parsed.taskId ?? null,
          requestId: request.requestId,
        },
      });
      return transaction.project.findUniqueOrThrow({ where: { id: projectId } });
    });

    await this.audit.record({
      actor,
      action: "PROJECT_STATE_TRANSITION",
      resourceType: "Project",
      resourceId: projectId,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      reason: parsed.reason,
      metadata: { from: current.status, to: parsed.to },
    });
    return updated;
  }

  async transitionSystem(
    projectId: string,
    to: ProjectStatus,
    reason: string,
    actor: RequestAuth,
    request: FactoryRequest,
    related: { artifactId?: string; decisionRecordId?: string; taskId?: string } = {},
  ): Promise<void> {
    const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (current.status === to) return;
    assertProjectTransition(current.status as ProjectStatus, to);
    await prisma.$transaction([
      prisma.project.update({
        where: { id: projectId },
        data: { status: to, version: { increment: 1 } },
      }),
      prisma.projectStateHistory.create({
        data: {
          projectId,
          previousStatus: current.status,
          newStatus: to,
          actorId: actor.userId,
          reason,
          artifactId: related.artifactId ?? null,
          decisionRecordId: related.decisionRecordId ?? null,
          taskId: related.taskId ?? null,
          requestId: request.requestId,
        },
      }),
    ]);
  }

  async history(projectId: string) {
    await this.get(projectId);
    return prisma.projectStateHistory.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }
}
