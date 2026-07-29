import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@sandeul/database";
import { hmacSha256, redact } from "@sandeul/security";
import type { RequestAuth } from "../common/request-context.js";

export interface AuditEvent {
  actor?: RequestAuth | undefined;
  action: string;
  resourceType: string;
  resourceId?: string | undefined;
  projectId?: string | undefined;
  requestId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  reason?: string | undefined;
  metadata?: unknown;
}

@Injectable()
export class AuditService {
  async record(event: AuditEvent): Promise<void> {
    const pepper = process.env.AUDIT_HASH_PEPPER ?? "development-only";
    await prisma.auditLog.create({
      data: {
        actorId: event.actor?.userId ?? null,
        actorRole: event.actor?.role ?? null,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        projectId: event.projectId ?? null,
        requestId: event.requestId,
        ipHash: event.ip ? hmacSha256(event.ip, pepper) : null,
        userAgent: event.userAgent?.slice(0, 500) ?? null,
        outcome: event.outcome,
        reason: event.reason ?? null,
        metadata: event.metadata
          ? (redact(event.metadata) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }
}
