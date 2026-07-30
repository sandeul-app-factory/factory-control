import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Readable } from "node:stream";
import { z } from "zod";
import {
  androidBuildReadyPrdJsonSchema,
  androidBuildReadyPrdMarkdownTemplate,
  androidBuildReadyPrdSchemaVersion,
  fixedProductOwners,
} from "@sandeul/contracts";
import { prisma } from "@sandeul/database";
import { isAllowedOrigin, sha256 } from "@sandeul/security";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { ArtifactsService } from "../artifacts/artifacts.service.js";
import { AuditService } from "../audit/audit.service.js";
import { DecisionsService } from "../decisions/decisions.service.js";
import { PrdService } from "../prd/prd.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { isMcpWriteTool, mcpToolNames, mcpTools } from "./tools.js";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface McpPrincipal {
  credentialId: string;
  actor: RequestAuth;
  scopes: Set<string>;
  rateLimit: number;
}

export interface McpHandleResult {
  notification: boolean;
  response?: {
    jsonrpc: "2.0";
    id: JsonRpcId;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
  };
}

const protocolVersions = new Set(["2025-11-25", "2025-06-18", "2026-07-28"]);
const recordSchema = z.record(z.string(), z.unknown());
const uuidSchema = z.uuid();

function jsonString(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): McpHandleResult {
  return {
    notification: false,
    response: {
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data === undefined ? {} : { data }) },
    },
  };
}

@Injectable()
export class McpService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly artifacts: ArtifactsService,
    private readonly prds: PrdService,
    private readonly decisions: DecisionsService,
    private readonly audit: AuditService,
  ) {}

  assertEnabled(): void {
    if ((process.env.MCP_ENABLED ?? "false") !== "true") {
      throw new NotFoundException("MCP endpoint가 비활성화되어 있습니다.");
    }
  }

  validateOrigin(request: FactoryRequest): void {
    const origin = request.header("origin");
    if (!origin) return;
    const allowed = (
      process.env.MCP_ALLOWED_ORIGINS ??
      process.env.FACTORY_PUBLIC_URL ??
      "https://factory.sandeul.work"
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!isAllowedOrigin(origin, allowed)) {
      throw new ForbiddenException("허용되지 않은 MCP Origin입니다.");
    }
  }

  async handle(body: unknown, request: FactoryRequest): Promise<McpHandleResult> {
    this.assertEnabled();
    this.validateOrigin(request);
    const principal = await this.authenticate(request);
    await this.enforceRateLimit(principal);

    const parsed = this.parseRequest(body);
    const id = parsed.id ?? null;
    this.validateProtocolHeaders(parsed, request);
    if (parsed.id === undefined) {
      await this.recordRequest(principal, parsed.method, undefined, request, "SUCCESS");
      return { notification: true };
    }

    try {
      let result: unknown;
      let requestOutcome: "SUCCESS" | "FAILURE" = "SUCCESS";
      if (parsed.method === "initialize") {
        result = {
          protocolVersion: "2025-11-25",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "sandeul-app-factory", version: "2.0.0" },
          instructions:
            "Factory read tools are the default. Canonical PRDs are authored in ChatGPT, downloaded by the user, and uploaded manually through the Factory web UI. MCP write tools are exposed only when the operator explicitly enables MCP_WRITE_ENABLED=true. Manual upload never implies CEO approval, lock, or development start.",
        };
      } else if (parsed.method === "server/discover") {
        result = {
          protocolVersion: "2026-07-28",
          serverInfo: { name: "sandeul-app-factory", version: "2.0.0" },
          capabilities: { tools: {} },
        };
      } else if (parsed.method === "ping") {
        result = {};
      } else if (parsed.method === "tools/list") {
        result = {
          tools: mcpTools.filter(
            (tool) => this.isToolEnabled(tool) && this.hasScope(principal, tool.name),
          ),
          ttlMs: 60_000,
          cacheScope: "private",
        };
      } else if (parsed.method === "tools/call") {
        const params = recordSchema.safeParse(parsed.params);
        if (!params.success || typeof params.data.name !== "string") {
          return rpcError(id, -32602, "tools/call params가 올바르지 않습니다.");
        }
        const toolName = params.data.name;
        if (!mcpToolNames.has(toolName)) {
          return rpcError(id, -32602, `Unknown tool: ${toolName}`);
        }
        const tool = mcpTools.find((candidate) => candidate.name === toolName);
        if (!tool || !this.isToolEnabled(tool)) {
          await this.recordRequest(principal, parsed.method, toolName, request, "DENIED");
          return rpcError(
            id,
            -32602,
            "MCP write tools are disabled. Upload the final PRD manually in the Factory web UI.",
          );
        }
        if (!this.hasScope(principal, toolName)) {
          await this.recordRequest(principal, parsed.method, toolName, request, "DENIED");
          return rpcError(id, -32602, `Tool scope denied: ${toolName}`);
        }
        try {
          const output = await this.callTool(
            toolName,
            params.data.arguments ?? {},
            principal.actor,
            request,
          );
          result = {
            content: [{ type: "text", text: jsonString(output) }],
            structuredContent: output,
            isError: false,
          };
        } catch (error) {
          requestOutcome = "FAILURE";
          result = {
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : "Factory tool execution failed",
              },
            ],
            isError: true,
          };
        }
      } else {
        return rpcError(id, -32601, `Method not found: ${parsed.method}`);
      }
      await this.recordRequest(
        principal,
        parsed.method,
        this.toolName(parsed),
        request,
        requestOutcome,
      );
      return { notification: false, response: { jsonrpc: "2.0", id, result } };
    } catch (error) {
      await this.recordRequest(principal, parsed.method, this.toolName(parsed), request, "FAILURE");
      return rpcError(
        id,
        -32603,
        "Internal error",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }

  private parseRequest(body: unknown): JsonRpcRequest {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException("JSON-RPC object가 필요합니다.");
    }
    const candidate = body as Record<string, unknown>;
    if (
      candidate.jsonrpc !== "2.0" ||
      typeof candidate.method !== "string" ||
      (candidate.id !== undefined &&
        candidate.id !== null &&
        typeof candidate.id !== "string" &&
        typeof candidate.id !== "number")
    ) {
      throw new BadRequestException("올바른 JSON-RPC 2.0 요청이 아닙니다.");
    }
    return {
      jsonrpc: "2.0",
      method: candidate.method,
      ...(candidate.id === undefined ? {} : { id: candidate.id as JsonRpcId }),
      ...(candidate.params === undefined ? {} : { params: candidate.params }),
    };
  }

  private validateProtocolHeaders(message: JsonRpcRequest, request: FactoryRequest): void {
    const version =
      request.header("mcp-protocol-version") ??
      (message.method === "initialize" ? undefined : "2025-03-26");
    if (version && !protocolVersions.has(version)) {
      throw new BadRequestException("지원하지 않는 MCP protocol version입니다.");
    }
    if (version === "2026-07-28") {
      const mirroredMethod = request.header("mcp-method");
      if (mirroredMethod !== message.method) {
        throw new BadRequestException("Mcp-Method header와 JSON-RPC method가 일치하지 않습니다.");
      }
      if (message.method === "tools/call") {
        const params = recordSchema.safeParse(message.params);
        const name = params.success ? params.data.name : undefined;
        if (typeof name !== "string" || request.header("mcp-name") !== name) {
          throw new BadRequestException("Mcp-Name header와 tool name이 일치하지 않습니다.");
        }
      }
    }
  }

  private async authenticate(request: FactoryRequest): Promise<McpPrincipal> {
    const pepper = process.env.MCP_TOKEN_PEPPER?.trim();
    if (!pepper) throw new ServiceUnavailableException("MCP token pepper가 설정되지 않았습니다.");
    const authorization = request.header("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]{32,200})$/.exec(authorization);
    if (!match?.[1]) throw new UnauthorizedException("MCP Bearer token이 필요합니다.");
    const credential = await prisma.mcpCredential.findUnique({
      where: { tokenHash: sha256(`${pepper}:${match[1]}`) },
    });
    const now = new Date();
    if (
      !credential ||
      credential.status !== "ACTIVE" ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt <= now)
    ) {
      throw new UnauthorizedException("MCP credential이 만료되었거나 유효하지 않습니다.");
    }
    const user = await prisma.user.findFirst({
      where: { id: credential.createdBy, status: "ACTIVE", deletedAt: null },
    });
    if (!user) throw new UnauthorizedException("MCP credential 소유자가 비활성화되었습니다.");
    await prisma.mcpCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: now, version: { increment: 1 } },
    });
    const rawScopes = Array.isArray(credential.scopes) ? credential.scopes : [];
    return {
      credentialId: credential.id,
      actor: {
        userId: user.id,
        loginId: user.loginId,
        email: user.email,
        role: user.role,
        sessionId: `mcp:${credential.id}`,
        csrfToken: "",
      },
      scopes: new Set(rawScopes.filter((scope): scope is string => typeof scope === "string")),
      rateLimit: credential.rateLimit,
    };
  }

  private async enforceRateLimit(principal: McpPrincipal): Promise<void> {
    const used = await prisma.auditLog.count({
      where: {
        action: "MCP_REQUEST",
        resourceType: "McpCredential",
        resourceId: principal.credentialId,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (used >= principal.rateLimit) {
      throw new HttpException(
        "MCP credential rate limit을 초과했습니다.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private hasScope(principal: McpPrincipal, toolName: string): boolean {
    return principal.scopes.has("factory.*") || principal.scopes.has(toolName);
  }

  private toolName(request: JsonRpcRequest): string | undefined {
    if (request.method !== "tools/call") return undefined;
    const params = recordSchema.safeParse(request.params);
    return params.success && typeof params.data.name === "string" ? params.data.name : undefined;
  }

  private async recordRequest(
    principal: McpPrincipal,
    method: string,
    toolName: string | undefined,
    request: FactoryRequest,
    outcome: "SUCCESS" | "FAILURE" | "DENIED",
  ): Promise<void> {
    await this.audit.record({
      actor: principal.actor,
      action: "MCP_REQUEST",
      resourceType: "McpCredential",
      resourceId: principal.credentialId,
      requestId: request.requestId,
      outcome,
      metadata: { method, toolName },
    });
  }

  private async callTool(
    name: string,
    rawArguments: unknown,
    actor: RequestAuth,
    request: FactoryRequest,
  ): Promise<unknown> {
    const args = recordSchema.parse(rawArguments);
    if (name === "factory.get_prd_schema") {
      return {
        schemaVersion: androidBuildReadyPrdSchemaVersion,
        formatRecommendation: "JSON",
        owners: fixedProductOwners,
        workflow: [
          "이 Schema를 완전히 충족하는 PRD를 ChatGPT 대화에서 작성한다.",
          "미결정 사항을 숨기지 말고 openQuestions에 기록한다.",
          "최종 prd.json과 사람이 읽을 prd.md를 사용자에게 파일로 제공한다.",
          "사용자가 Factory 웹에서 최종 prd.json을 직접 업로드한다.",
          "Factory 서버 검증 후 CEO가 최종 승인하고 PRD를 잠근다.",
          "Repository 준비 후 CEO가 개발 시작을 눌러야 Codex 작업이 시작된다.",
        ],
        jsonSchema: androidBuildReadyPrdJsonSchema,
        markdownTemplate: androidBuildReadyPrdMarkdownTemplate,
      };
    }
    if (name === "factory.list_projects") return this.projects.list();
    if (name === "factory.get_project") {
      return this.projects.get(uuidSchema.parse(args.projectId));
    }
    if (name === "factory.get_project_status") {
      const projectId = uuidSchema.parse(args.projectId);
      const [project, history] = await Promise.all([
        this.projects.get(projectId),
        this.projects.history(projectId),
      ]);
      return { projectId, status: project.status, version: project.version, history };
    }
    if (name === "factory.list_artifacts") {
      return this.artifacts.list(uuidSchema.parse(args.projectId));
    }
    if (name === "factory.read_artifact") {
      return this.artifacts.signedDownload(
        uuidSchema.parse(args.artifactVersionId),
        actor,
        request,
      );
    }
    if (name === "factory.create_project") {
      return this.projects.create(
        {
          name: z.string().parse(args.name),
          slug: z.string().parse(args.slug),
          summary: typeof args.summary === "string" ? args.summary : "",
        },
        actor,
        request,
      );
    }
    if (name === "factory.upload_prd" || name === "factory.create_prd_version") {
      return this.uploadPrd(args, actor, request);
    }
    if (name === "factory.record_ceo_constraint") {
      const projectId = uuidSchema.parse(args.projectId);
      const input = { ...args };
      delete input.projectId;
      return this.decisions.createConstraint(projectId, input, actor, request);
    }
    if (name === "factory.record_decision") {
      const projectId = uuidSchema.parse(args.projectId);
      const input = { ...args };
      delete input.projectId;
      return this.decisions.createDecision(projectId, input, actor, request);
    }
    if (name === "factory.request_prd_review") {
      return this.prds.requestReview(uuidSchema.parse(args.prdVersionId), actor, request);
    }
    throw new BadRequestException(`Unknown tool: ${name}`);
  }

  private async uploadPrd(
    args: Record<string, unknown>,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const projectId = uuidSchema.parse(args.projectId);
    const format = z.enum(["MARKDOWN", "JSON"]).parse(args.format);
    const content =
      format === "MARKDOWN"
        ? z.string().min(1).parse(args.content)
        : jsonString(z.unknown().parse(args.content));
    const buffer = Buffer.from(content, "utf8");
    const maxBytes = Number(process.env.MCP_MAX_PRD_BYTES ?? 2_097_152);
    if (buffer.length > maxBytes) {
      throw new BadRequestException(`MCP PRD는 ${maxBytes} bytes를 초과할 수 없습니다.`);
    }
    const extension = format === "MARKDOWN" ? "md" : "json";
    const file = {
      fieldname: "file",
      originalname: `mcp-prd-${Date.now()}.${extension}`,
      encoding: "7bit",
      mimetype: format === "MARKDOWN" ? "text/markdown" : "application/json",
      size: buffer.length,
      buffer,
      destination: "",
      filename: "",
      path: "",
      stream: Readable.from(buffer),
    } satisfies Express.Multer.File;
    const stringArray = (value: unknown): string | undefined =>
      Array.isArray(value) ? JSON.stringify(value) : undefined;
    return this.prds.upload(
      projectId,
      file,
      {
        acceptanceCriteria: stringArray(args.acceptanceCriteria),
        includedArtifactIds: stringArray(args.includedArtifactIds),
        excludedScope: stringArray(args.excludedScope),
        ingestionSource: "MCP",
      },
      actor,
      request,
    );
  }

  private isToolEnabled(tool: (typeof mcpTools)[number]): boolean {
    return !isMcpWriteTool(tool) || (process.env.MCP_WRITE_ENABLED ?? "false") === "true";
  }
}
