import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { decisionInputSchema } from "@sandeul/contracts";
import { prisma } from "@sandeul/database";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";

function latest<T extends { logicalId: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.logicalId)) return false;
    seen.add(record.logicalId);
    return true;
  });
}

@Injectable()
export class DecisionsService {
  constructor(private readonly audit: AuditService) {}

  async listConstraints(projectId: string, includeHistory = false) {
    const records = await prisma.ceoConstraint.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { versionNumber: "desc" }],
    });
    return includeHistory ? records : latest(records);
  }

  async listDecisions(projectId: string, includeHistory = false) {
    const records = await prisma.decisionRecord.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { versionNumber: "desc" }],
    });
    return includeHistory ? records : latest(records);
  }

  async createConstraint(
    projectId: string,
    body: unknown,
    actor: RequestAuth,
    request: FactoryRequest,
    logicalId: string = randomUUID(),
  ) {
    const parsed = decisionInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const existing = await prisma.ceoConstraint.findFirst({
      where: { projectId, logicalId },
      orderBy: { versionNumber: "desc" },
    });
    const constraint = await prisma.ceoConstraint.create({
      data: {
        projectId,
        logicalId,
        versionNumber: (existing?.versionNumber ?? 0) + 1,
        title: parsed.data.title,
        detail: parsed.data.detail,
        scope: parsed.data.scope,
        priority: parsed.data.priority,
        mandatory: parsed.data.mandatory,
        appliesPrdVersionId: parsed.data.appliesPrdVersionId ?? null,
        appliesTaskId: parsed.data.appliesTaskId ?? null,
        effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : null,
        reason: parsed.data.reason,
        createdBy: actor.userId,
      },
    });
    await this.audit.record({
      actor,
      action: "CEO_CONSTRAINT_CREATE",
      resourceType: "CeoConstraint",
      resourceId: constraint.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      reason: parsed.data.reason,
      metadata: { logicalId, versionNumber: constraint.versionNumber },
    });
    return constraint;
  }

  async reviseConstraint(
    projectId: string,
    logicalId: string,
    body: unknown,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const exists = await prisma.ceoConstraint.count({ where: { projectId, logicalId } });
    if (!exists) throw new NotFoundException("수정할 CEO 제약사항을 찾을 수 없습니다.");
    return this.createConstraint(projectId, body, actor, request, logicalId);
  }

  async createDecision(
    projectId: string,
    body: unknown,
    actor: RequestAuth,
    request: FactoryRequest,
    logicalId: string = randomUUID(),
  ) {
    const parsed = decisionInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const existing = await prisma.decisionRecord.findFirst({
      where: { projectId, logicalId },
      orderBy: { versionNumber: "desc" },
    });
    const decision = await prisma.decisionRecord.create({
      data: {
        projectId,
        logicalId,
        versionNumber: (existing?.versionNumber ?? 0) + 1,
        action: parsed.data.action ?? null,
        title: parsed.data.title,
        detail: parsed.data.detail,
        scope: parsed.data.scope,
        priority: parsed.data.priority,
        mandatory: parsed.data.mandatory,
        appliesPrdVersionId: parsed.data.appliesPrdVersionId ?? null,
        appliesTaskId: parsed.data.appliesTaskId ?? null,
        effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : null,
        reason: parsed.data.reason,
        createdBy: actor.userId,
      },
    });
    await this.audit.record({
      actor,
      action: "DECISION_RECORD_CREATE",
      resourceType: "DecisionRecord",
      resourceId: decision.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      reason: parsed.data.reason,
      metadata: {
        logicalId,
        versionNumber: decision.versionNumber,
        action: decision.action,
      },
    });
    return decision;
  }

  async reviseDecision(
    projectId: string,
    logicalId: string,
    body: unknown,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const exists = await prisma.decisionRecord.count({ where: { projectId, logicalId } });
    if (!exists) throw new NotFoundException("수정할 의사결정 기록을 찾을 수 없습니다.");
    return this.createDecision(projectId, body, actor, request, logicalId);
  }
}
