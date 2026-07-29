import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@sandeul/database";
import {
  androidRepositoryBootstrapFiles,
  createGithubAdapter,
  verifyGithubWebhook,
} from "@sandeul/github";
import { repositoryInputSchema } from "@sandeul/contracts";
import { sha256 } from "@sandeul/security";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { TasksService } from "../tasks/tasks.service.js";

interface CreateRepositoryBody {
  owner?: unknown;
  name?: unknown;
  description?: unknown;
  private?: unknown;
  templateOwner?: unknown;
  templateName?: unknown;
}

@Injectable()
export class RepositoriesService {
  private readonly github = createGithubAdapter();

  constructor(
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
  ) {}

  listOrganizations() {
    return this.github.listOrganizations();
  }

  listRemoteRepositories(owner: string) {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) {
      throw new BadRequestException("GitHub owner가 올바르지 않습니다.");
    }
    return this.github.listRepositories(owner);
  }

  async get(projectId: string) {
    const repository = await prisma.githubRepository.findFirst({
      where: { projectId, deletedAt: null },
    });
    if (!repository) throw new NotFoundException("연결된 GitHub Repository가 없습니다.");
    const [pullRequests, checks] = await Promise.all([
      this.github.listPullRequests(repository.owner, repository.name),
      this.github.getChecks(repository.owner, repository.name, repository.defaultBranch),
    ]);
    return { ...repository, pullRequests, checks };
  }

  async connect(projectId: string, body: unknown, actor: RequestAuth, request: FactoryRequest) {
    const parsed = repositoryInputSchema.safeParse(
      typeof body === "object" && body ? { ...body, projectId } : body,
    );
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.assertCanConnect(projectId);
    const remote = await this.github.getRepository(parsed.data.owner, parsed.data.name);
    if (remote.htmlUrl !== parsed.data.htmlUrl || remote.id !== parsed.data.externalId) {
      throw new BadRequestException(
        "GitHub에서 확인한 Repository 정보와 요청이 일치하지 않습니다.",
      );
    }
    const repository = await prisma.githubRepository.create({
      data: {
        projectId,
        externalId: remote.id,
        owner: remote.owner,
        name: remote.name,
        htmlUrl: remote.htmlUrl,
        defaultBranch: remote.defaultBranch,
        authMode: this.github.mode === "GITHUB_APP" ? "APP" : this.github.mode,
        installationId: process.env.GITHUB_INSTALLATION_ID ?? null,
        lastSyncedAt: new Date(),
        createdBy: actor.userId,
      },
    });
    await this.projects.transitionSystem(
      projectId,
      "REPO_READY",
      `기존 Repository 연결: ${remote.owner}/${remote.name}`,
      actor,
      request,
    );
    await this.audit.record({
      actor,
      action: "GITHUB_REPOSITORY_CONNECT",
      resourceType: "GithubRepository",
      resourceId: repository.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { owner: remote.owner, name: remote.name, authMode: this.github.mode },
    });
    const development = await this.tasks.prepareFromLockedPrd(
      projectId,
      actor,
      request,
      repository.id,
    );
    return { ...repository, development };
  }

  async create(
    projectId: string,
    body: CreateRepositoryBody,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    await this.assertCanConnect(projectId);
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const templateOwner =
      typeof body.templateOwner === "string" && body.templateOwner.trim()
        ? body.templateOwner.trim()
        : undefined;
    const templateName =
      typeof body.templateName === "string" && body.templateName.trim()
        ? body.templateName.trim()
        : undefined;
    if (
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(name)
    ) {
      throw new BadRequestException("GitHub owner 또는 Repository 이름이 올바르지 않습니다.");
    }
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await this.projects.transitionSystem(
      projectId,
      "REPO_BOOTSTRAPPING",
      "GitHub Repository 생성 요청",
      actor,
      request,
    );
    try {
      const remote = await this.github.createRepository({
        owner,
        name,
        description: description || project.summary,
        private: body.private !== false,
        ...(templateOwner ? { templateOwner } : {}),
        ...(templateName ? { templateName } : {}),
      });
      const files = await androidRepositoryBootstrapFiles();
      for (const [path, content] of Object.entries(files)) {
        await this.github.createOrUpdateFile(
          remote.owner,
          remote.name,
          path,
          content,
          `chore: initialize ${path} for Sandeul App Factory`,
          remote.defaultBranch,
        );
      }
      const repository = await prisma.githubRepository.create({
        data: {
          projectId,
          externalId: remote.id,
          owner: remote.owner,
          name: remote.name,
          htmlUrl: remote.htmlUrl,
          defaultBranch: remote.defaultBranch,
          authMode: this.github.mode === "GITHUB_APP" ? "APP" : this.github.mode,
          installationId: process.env.GITHUB_INSTALLATION_ID ?? null,
          lastSyncedAt: new Date(),
          createdBy: actor.userId,
        },
      });
      await this.projects.transitionSystem(
        projectId,
        "REPO_READY",
        `Repository 생성 완료: ${remote.owner}/${remote.name}`,
        actor,
        request,
      );
      await this.audit.record({
        actor,
        action: "GITHUB_REPOSITORY_CREATE",
        resourceType: "GithubRepository",
        resourceId: repository.id,
        projectId,
        requestId: request.requestId,
        outcome: "SUCCESS",
        metadata: { owner: remote.owner, name: remote.name, templateOwner, templateName },
      });
      const development = await this.tasks.prepareFromLockedPrd(
        projectId,
        actor,
        request,
        repository.id,
      );
      return { ...repository, development };
    } catch (error) {
      await this.projects.transitionSystem(
        projectId,
        "PRD_LOCKED",
        "Repository 생성 실패로 잠긴 PRD 단계로 복귀",
        actor,
        request,
      );
      await this.audit.record({
        actor,
        action: "GITHUB_REPOSITORY_CREATE",
        resourceType: "GithubRepository",
        projectId,
        requestId: request.requestId,
        outcome: "FAILURE",
        reason: error instanceof Error ? error.message.slice(0, 1000) : "unknown",
      });
      throw error;
    }
  }

  async processWebhook(
    request: FactoryRequest,
  ): Promise<{ accepted: boolean; duplicate: boolean }> {
    const rawBody = request.rawBody;
    const signature = request.header("x-hub-signature-256");
    const deliveryId = request.header("x-github-delivery");
    const eventName = request.header("x-github-event");
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
    if (!rawBody || !verifyGithubWebhook(rawBody, signature, secret)) {
      throw new UnauthorizedException("GitHub Webhook signature가 올바르지 않습니다.");
    }
    if (!deliveryId || !eventName || deliveryId.length > 200 || eventName.length > 100) {
      throw new BadRequestException("GitHub Webhook header가 올바르지 않습니다.");
    }
    const existing = await prisma.webhookDelivery.findUnique({ where: { deliveryId } });
    if (existing) return { accepted: true, duplicate: true };
    const delivery = await prisma.webhookDelivery.create({
      data: {
        deliveryId,
        eventName,
        signature: signature?.slice(0, 200) ?? null,
        payloadSha256: sha256(rawBody),
      },
    });
    try {
      const payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
      const repository = payload.repository as
        | { id?: string | number; default_branch?: string }
        | undefined;
      if (repository?.id !== undefined) {
        await prisma.githubRepository.updateMany({
          where: { externalId: String(repository.id), deletedAt: null },
          data: {
            ...(repository.default_branch ? { defaultBranch: repository.default_branch } : {}),
            lastSyncedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      await this.audit.record({
        action: "GITHUB_WEBHOOK",
        resourceType: "WebhookDelivery",
        resourceId: delivery.id,
        requestId: request.requestId,
        outcome: "SUCCESS",
        metadata: { deliveryId, eventName, payloadSha256: delivery.payloadSha256 },
      });
      return { accepted: true, duplicate: false };
    } catch (error) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED" },
      });
      throw new BadRequestException("GitHub Webhook payload를 처리하지 못했습니다.", {
        cause: error,
      });
    }
  }

  private async assertCanConnect(projectId: string): Promise<void> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    if (project.status !== "PRD_LOCKED") {
      throw new ConflictException(
        "잠긴 PRD가 있는 프로젝트에서만 Repository를 연결할 수 있습니다.",
      );
    }
    const existing = await prisma.githubRepository.count({
      where: { projectId, deletedAt: null },
    });
    if (existing) throw new ConflictException("프로젝트에 이미 Repository가 연결되어 있습니다.");
  }
}
