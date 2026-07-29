import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@sandeul/database";
import { sha256 } from "@sandeul/security";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";
import { mcpToolNames } from "../mcp/tools.js";

const credentialSchema = z.object({
  name: z.string().trim().min(3).max(200),
  scopes: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  rateLimit: z.number().int().min(1).max(1000).default(30),
  expiresAt: z.iso.datetime().optional(),
});

@Injectable()
export class SettingsService {
  constructor(private readonly audit: AuditService) {}

  async get() {
    const mcpCredentialCount = await prisma.mcpCredential.count({
      where: { status: "ACTIVE", revokedAt: null },
    });
    return {
      publicUrl: process.env.FACTORY_PUBLIC_URL ?? "https://factory.sandeul.work",
      timezone: "Asia/Seoul",
      githubAdapter: process.env.GITHUB_ADAPTER ?? "fake",
      codexAdapter: process.env.CODEX_ADAPTER ?? "fake",
      codexConcurrency: Number(process.env.CODEX_CONCURRENCY ?? 1),
      mcpEnabled: (process.env.MCP_ENABLED ?? "false") === "true",
      mcpCredentialCount,
      signingWorkerEnabled: (process.env.SIGNING_WORKER_ENABLED ?? "false") === "true",
      sessionSecure: (process.env.SESSION_SECURE ?? "true") === "true",
      sessionSameSite: process.env.SESSION_SAME_SITE ?? "lax",
      cloudflareAccessSupported: true,
    };
  }

  credentials() {
    return prisma.mcpCredential.findMany({
      select: {
        id: true,
        name: true,
        scopes: true,
        rateLimit: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        revokedAt: true,
        version: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createCredential(body: unknown, actor: RequestAuth, request: FactoryRequest) {
    const parsed = credentialSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const invalidScope = parsed.data.scopes.find(
      (scope) => scope !== "factory.*" && !mcpToolNames.has(scope),
    );
    if (invalidScope) throw new BadRequestException(`허용되지 않은 MCP scope: ${invalidScope}`);
    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException("MCP credential 만료일은 미래여야 합니다.");
    }
    const pepper = process.env.MCP_TOKEN_PEPPER?.trim();
    if (!pepper) {
      throw new ServiceUnavailableException("MCP_TOKEN_PEPPER가 설정되지 않았습니다.");
    }
    const existing = await prisma.mcpCredential.findUnique({ where: { name: parsed.data.name } });
    if (existing) throw new ConflictException("같은 이름의 MCP credential이 이미 있습니다.");
    const token = randomBytes(32).toString("base64url");
    const credential = await prisma.mcpCredential.create({
      data: {
        name: parsed.data.name,
        tokenHash: sha256(`${pepper}:${token}`),
        scopes: parsed.data.scopes,
        rateLimit: parsed.data.rateLimit,
        expiresAt,
        createdBy: actor.userId,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        rateLimit: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await this.audit.record({
      actor,
      action: "SETTING_CHANGE",
      resourceType: "McpCredential",
      resourceId: credential.id,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: {
        operation: "CREATE",
        name: credential.name,
        scopes: credential.scopes,
        rateLimit: credential.rateLimit,
        expiresAt: credential.expiresAt,
      },
    });
    return {
      ...credential,
      token,
      warning: "이 token은 다시 표시되지 않습니다. 안전한 Secret 저장소에 즉시 보관하세요.",
    };
  }

  async revokeCredential(credentialId: string, actor: RequestAuth, request: FactoryRequest) {
    const credential = await prisma.mcpCredential.findUnique({ where: { id: credentialId } });
    if (!credential) throw new NotFoundException("MCP credential을 찾을 수 없습니다.");
    if (credential.revokedAt) return { id: credential.id, revokedAt: credential.revokedAt };
    const revokedAt = new Date();
    await prisma.mcpCredential.update({
      where: { id: credential.id },
      data: { status: "REVOKED", revokedAt, version: { increment: 1 } },
    });
    await this.audit.record({
      actor,
      action: "SETTING_CHANGE",
      resourceType: "McpCredential",
      resourceId: credential.id,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { operation: "REVOKE", name: credential.name },
    });
    return { id: credential.id, revokedAt };
  }
}
