import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@sandeul/database";
import { taskInputSchema } from "@sandeul/contracts";
import { sha256 } from "@sandeul/security";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";

interface QueueJobData {
  developmentTaskId: string;
  codexRunId: string;
  jobRecordId: string;
}

const taskReadyStatuses = new Set([
  "REPO_READY",
  "CODE_REVIEW",
  "QA_TESTING",
  "SECURITY_REVIEW",
  "RELEASE_CANDIDATE",
  "FINAL_APPROVAL",
  "BUILT",
]);

function validatePathPolicy(paths: string[]): void {
  for (const path of paths) {
    if (
      path.includes("\0") ||
      path.includes("\\") ||
      path.startsWith("/") ||
      /^[A-Za-z]:/.test(path) ||
      path.split("/").includes("..")
    ) {
      throw new BadRequestException(`허용되지 않은 경로 정책입니다: ${path}`);
    }
  }
}

@Injectable()
export class TasksService implements OnModuleDestroy {
  private readonly connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  private readonly queue = new Queue<QueueJobData>(process.env.CODEX_QUEUE_NAME ?? "codex-tasks", {
    connection: this.connection,
  });

  constructor(
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }

  list(projectId: string) {
    return prisma.developmentTask.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  listAll() {
    return prisma.developmentTask.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  }

  async get(taskId: string) {
    const task = await prisma.developmentTask.findFirst({
      where: { id: taskId, deletedAt: null },
    });
    if (!task) throw new NotFoundException("개발 작업을 찾을 수 없습니다.");
    const [instructions, runs, job, repository, testRun, securityScan, build] = await Promise.all([
      prisma.taskInstructionVersion.findMany({
        where: { developmentTaskId: taskId },
        orderBy: { versionNumber: "desc" },
      }),
      prisma.codexRun.findMany({
        where: { developmentTaskId: taskId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.job.findFirst({
        where: { developmentTaskId: taskId },
        orderBy: { createdAt: "desc" },
      }),
      task.targetRepositoryId
        ? prisma.githubRepository.findUnique({ where: { id: task.targetRepositoryId } })
        : null,
      prisma.testRun.findFirst({
        where: { developmentTaskId: taskId },
        orderBy: { createdAt: "desc" },
        include: { results: true },
      }),
      prisma.securityScan.findFirst({
        where: { developmentTaskId: taskId },
        orderBy: { createdAt: "desc" },
        include: { findings: true },
      }),
      prisma.build.findFirst({
        where: { developmentTaskId: taskId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const runIds = runs.map((run) => run.id);
    const events = runIds.length
      ? await prisma.codexRunEvent.findMany({
          where: { codexRunId: { in: runIds } },
          select: {
            id: true,
            codexRunId: true,
            sequence: true,
            eventType: true,
            level: true,
            message: true,
            createdAt: true,
          },
          orderBy: [{ codexRunId: "asc" }, { sequence: "asc" }],
          take: 1000,
        })
      : [];
    const release = build
      ? await prisma.release.findFirst({
          where: { buildId: build.id, deletedAt: null },
          orderBy: { createdAt: "desc" },
        })
      : null;
    return {
      ...task,
      instructions,
      runs,
      events,
      job,
      repository,
      pipeline: { testRun, securityScan, build, release },
    };
  }

  async create(projectId: string, body: unknown, actor: RequestAuth, request: FactoryRequest) {
    const parsed = taskInputSchema.safeParse(
      typeof body === "object" && body ? { ...body, projectId } : body,
    );
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    validatePathPolicy(parsed.data.allowedPaths);
    validatePathPolicy(parsed.data.deniedPaths);
    const duplicate = await prisma.developmentTask.findUnique({
      where: { idempotencyKey: parsed.data.idempotencyKey },
    });
    if (duplicate) return this.get(duplicate.id);

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    if (!taskReadyStatuses.has(project.status)) {
      throw new ConflictException(
        "Repository 준비 이후의 개발 단계에서만 작업을 만들 수 있습니다.",
      );
    }
    const lockedPrd = await prisma.prdVersion.findFirst({
      where: { projectId, status: "LOCKED", deletedAt: null },
      orderBy: { versionNumber: "desc" },
    });
    if (!lockedPrd) throw new ConflictException("잠긴 PRD가 없습니다.");
    const repository = parsed.data.targetRepositoryId
      ? await prisma.githubRepository.findFirst({
          where: {
            id: parsed.data.targetRepositoryId,
            projectId,
            deletedAt: null,
          },
        })
      : await prisma.githubRepository.findFirst({ where: { projectId, deletedAt: null } });
    if (!repository) throw new ConflictException("연결된 Repository가 없습니다.");
    if (parsed.data.targetCommitSha) {
      const commit = await import("@sandeul/github").then(({ createGithubAdapter }) =>
        createGithubAdapter().getCommit(
          repository.owner,
          repository.name,
          parsed.data.targetCommitSha!,
        ),
      );
      if (commit.sha.toLowerCase() !== parsed.data.targetCommitSha.toLowerCase()) {
        throw new BadRequestException("대상 Commit SHA 검증에 실패했습니다.");
      }
    }
    const deniedPaths = Array.from(
      new Set([
        ...parsed.data.deniedPaths,
        ".env",
        ".env.*",
        "**/*.jks",
        "**/*.keystore",
        "**/google-services.json",
      ]),
    );
    const created = await prisma.$transaction(async (transaction) => {
      const task = await transaction.developmentTask.create({
        data: {
          projectId,
          type: parsed.data.type,
          title: parsed.data.title,
          status: "DRAFT",
          targetRepositoryId: repository.id,
          targetBranch: parsed.data.targetBranch,
          targetCommitSha: parsed.data.targetCommitSha ?? null,
          lockedPrdVersionId: lockedPrd.id,
          lockedPrdSha256: lockedPrd.sha256,
          acceptanceCriteria: parsed.data.acceptanceCriteria,
          allowedPaths: parsed.data.allowedPaths,
          deniedPaths,
          idempotencyKey: parsed.data.idempotencyKey,
          createdBy: actor.userId,
        },
      });
      const instruction = await transaction.taskInstructionVersion.create({
        data: {
          developmentTaskId: task.id,
          versionNumber: 1,
          instruction: parsed.data.instruction,
          instructionSha256: sha256(parsed.data.instruction),
          createdBy: actor.userId,
        },
      });
      await transaction.developmentTask.update({
        where: { id: task.id },
        data: { currentInstructionId: instruction.id },
      });
      return task;
    });
    await this.audit.record({
      actor,
      action: "CODEX_TASK_CREATE",
      resourceType: "DevelopmentTask",
      resourceId: created.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: {
        type: created.type,
        status: created.status,
        lockedPrdSha256: created.lockedPrdSha256,
        targetRepositoryId: repository.id,
      },
    });
    return this.get(created.id);
  }

  async prepareFromLockedPrd(
    projectId: string,
    actor: RequestAuth,
    request: FactoryRequest,
    targetRepositoryId?: string,
  ) {
    const [project, lockedPrd, repository] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, deletedAt: null } }),
      prisma.prdVersion.findFirst({
        where: { projectId, status: "LOCKED", deletedAt: null },
        orderBy: { versionNumber: "desc" },
      }),
      targetRepositoryId
        ? prisma.githubRepository.findFirst({
            where: { id: targetRepositoryId, projectId, deletedAt: null },
          })
        : prisma.githubRepository.findFirst({ where: { projectId, deletedAt: null } }),
    ]);
    if (!project) throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    if (!lockedPrd) throw new ConflictException("잠긴 PRD가 없습니다.");
    if (!repository) {
      return { prepared: false, reason: "REPOSITORY_REQUIRED" as const, task: null };
    }
    const idempotencyKey = `locked-prd:${lockedPrd.id}:implement`;
    const existing = await prisma.developmentTask.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return {
        prepared: true,
        reason: "ALREADY_PREPARED" as const,
        task: await this.get(existing.id),
      };
    }
    const acceptanceCriteria = Array.isArray(lockedPrd.acceptanceCriteria)
      ? lockedPrd.acceptanceCriteria.filter((item): item is string => typeof item === "string")
      : [];
    if (!acceptanceCriteria.length) {
      throw new ConflictException("잠긴 PRD에 Acceptance Criteria가 없습니다.");
    }
    const task = await this.create(
      projectId,
      {
        type: "IMPLEMENT_PRD",
        title: `${project.name} v${lockedPrd.versionNumber} 개발`,
        instruction:
          "잠긴 PRD 전체 범위와 Acceptance Criteria를 구현합니다. 요구사항을 임의 확장하지 말고, 개발 완료 후 독립 테스트·보안검사·Release Candidate 빌드까지 실행 가능한 상태로 보고합니다.",
        acceptanceCriteria,
        targetRepositoryId: repository.id,
        targetBranch: repository.defaultBranch,
        allowedPaths: [],
        deniedPaths: ["infra/signing/**"],
        idempotencyKey,
      },
      actor,
      request,
    );
    return { prepared: true, reason: "CREATED" as const, task };
  }

  async start(taskId: string, actor: RequestAuth, request: FactoryRequest) {
    const task = await prisma.developmentTask.findFirst({
      where: { id: taskId, deletedAt: null },
    });
    if (!task) throw new NotFoundException("개발 작업을 찾을 수 없습니다.");
    if (task.status !== "DRAFT") {
      throw new ConflictException("DRAFT 상태의 개발 작업만 시작할 수 있습니다.");
    }
    if (!task.currentInstructionId) {
      throw new ConflictException("실행할 TaskInstructionVersion이 없습니다.");
    }
    const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId } });
    if (!taskReadyStatuses.has(project.status)) {
      throw new ConflictException("Repository가 준비된 개발 단계에서만 작업을 시작할 수 있습니다.");
    }
    const created = await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.developmentTask.updateMany({
        where: { id: task.id, status: "DRAFT" },
        data: { status: "QUEUED", version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("다른 요청이 이미 이 작업을 시작했습니다.");
      }
      const run = await transaction.codexRun.create({
        data: {
          developmentTaskId: task.id,
          instructionVersionId: task.currentInstructionId!,
          adapter: (process.env.CODEX_ADAPTER ?? "fake").toLowerCase(),
        },
      });
      await transaction.codexRunEvent.create({
        data: {
          codexRunId: run.id,
          sequence: 1,
          eventType: "run.queued",
          message: "사용자가 개발 시작을 요청해 Codex 작업이 대기열에 등록되었습니다.",
        },
      });
      const job = await transaction.job.create({
        data: {
          developmentTaskId: task.id,
          queueName: process.env.CODEX_QUEUE_NAME ?? "codex-tasks",
          type: "CODEX_EXECUTION",
          idempotencyKey: `codex:${task.idempotencyKey}:1`,
          maxAttempts: Number(process.env.CODEX_JOB_MAX_ATTEMPTS ?? 3),
        },
      });
      return { run, job };
    });
    await this.enqueue(task.id, created.run.id, created.job.id);
    await this.projects.transitionSystem(
      task.projectId,
      "DEVELOPMENT_QUEUED",
      `개발 시작: ${task.title}`,
      actor,
      request,
      { taskId: task.id },
    );
    await this.audit.record({
      actor,
      action: "CODEX_TASK_START",
      resourceType: "DevelopmentTask",
      resourceId: task.id,
      projectId: task.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { codexRunId: created.run.id, jobId: created.job.id },
    });
    return this.get(task.id);
  }

  async followUp(
    taskId: string,
    instructionText: unknown,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    if (
      typeof instructionText !== "string" ||
      !instructionText.trim() ||
      instructionText.length > 50_000
    ) {
      throw new BadRequestException("후속 지시는 1~50,000자여야 합니다.");
    }
    const task = await prisma.developmentTask.findFirst({
      where: { id: taskId, deletedAt: null },
    });
    if (!task) throw new NotFoundException("개발 작업을 찾을 수 없습니다.");
    if (task.status === "DRAFT") {
      throw new ConflictException("DRAFT 작업은 CEO의 개발 시작 액션으로만 실행할 수 있습니다.");
    }
    if (["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(task.status)) {
      throw new ConflictException("실행 중인 작업에는 새 지시 버전을 만들 수 없습니다.");
    }
    const created = await prisma.$transaction(async (transaction) => {
      const latest = await transaction.taskInstructionVersion.aggregate({
        where: { developmentTaskId: taskId },
        _max: { versionNumber: true },
      });
      const versionNumber = (latest._max.versionNumber ?? 0) + 1;
      const instruction = await transaction.taskInstructionVersion.create({
        data: {
          developmentTaskId: taskId,
          versionNumber,
          instruction: instructionText.trim(),
          instructionSha256: sha256(instructionText.trim()),
          createdBy: actor.userId,
        },
      });
      await transaction.developmentTask.update({
        where: { id: taskId },
        data: {
          status: "QUEUED",
          currentInstructionId: instruction.id,
          cancellationRequestedAt: null,
          version: { increment: 1 },
        },
      });
      const run = await transaction.codexRun.create({
        data: {
          developmentTaskId: taskId,
          instructionVersionId: instruction.id,
          adapter: (process.env.CODEX_ADAPTER ?? "fake").toLowerCase(),
        },
      });
      await transaction.codexRunEvent.create({
        data: {
          codexRunId: run.id,
          sequence: 1,
          eventType: "run.queued",
          message: `후속 지시 v${versionNumber} 작업이 대기열에 등록되었습니다.`,
        },
      });
      const job = await transaction.job.create({
        data: {
          developmentTaskId: taskId,
          queueName: process.env.CODEX_QUEUE_NAME ?? "codex-tasks",
          type: "CODEX_EXECUTION",
          idempotencyKey: `codex:${task.idempotencyKey}:${versionNumber}`,
          maxAttempts: Number(process.env.CODEX_JOB_MAX_ATTEMPTS ?? 3),
        },
      });
      return { instruction, run, job };
    });
    await this.enqueue(taskId, created.run.id, created.job.id);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId } });
    if (project.status !== "DEVELOPMENT_QUEUED") {
      await this.projects.transitionSystem(
        task.projectId,
        "DEVELOPMENT_QUEUED",
        `후속 지시 v${created.instruction.versionNumber} 등록`,
        actor,
        request,
        { taskId },
      );
    }
    await this.audit.record({
      actor,
      action: "CODEX_TASK_FOLLOW_UP",
      resourceType: "TaskInstructionVersion",
      resourceId: created.instruction.id,
      projectId: task.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { taskId, versionNumber: created.instruction.versionNumber },
    });
    return this.get(taskId);
  }

  async cancel(taskId: string, actor: RequestAuth, request: FactoryRequest) {
    const task = await prisma.developmentTask.findFirst({
      where: { id: taskId, deletedAt: null },
    });
    if (!task) throw new NotFoundException("개발 작업을 찾을 수 없습니다.");
    if (!["QUEUED", "RUNNING"].includes(task.status)) {
      throw new ConflictException("대기 또는 실행 중인 작업만 중단할 수 있습니다.");
    }
    const run = await prisma.codexRun.findFirst({
      where: { developmentTaskId: taskId, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    const jobRecord = await prisma.job.findFirst({
      where: { developmentTaskId: taskId, status: { in: ["QUEUED", "RUNNING", "RETRYING"] } },
      orderBy: { createdAt: "desc" },
    });
    await prisma.$transaction([
      prisma.developmentTask.update({
        where: { id: taskId },
        data: {
          status: "CANCEL_REQUESTED",
          cancellationRequestedAt: new Date(),
          version: { increment: 1 },
        },
      }),
      ...(run
        ? [
            prisma.codexRun.update({
              where: { id: run.id },
              data: { status: "CANCELLING", version: { increment: 1 } },
            }),
          ]
        : []),
      ...(jobRecord
        ? [
            prisma.job.update({
              where: { id: jobRecord.id },
              data: {
                lastError: "Cancellation requested by user",
                version: { increment: 1 },
              },
            }),
          ]
        : []),
    ]);
    if (jobRecord?.externalJobId) {
      const queued = await this.queue.getJob(jobRecord.externalJobId);
      if (queued && (await queued.getState()) === "waiting") {
        await queued.remove();
        await prisma.$transaction([
          prisma.developmentTask.update({
            where: { id: taskId },
            data: { status: "CANCELLED", version: { increment: 1 } },
          }),
          prisma.job.update({
            where: { id: jobRecord.id },
            data: { status: "CANCELLED", finishedAt: new Date(), version: { increment: 1 } },
          }),
          ...(run
            ? [
                prisma.codexRun.update({
                  where: { id: run.id },
                  data: {
                    status: "CANCELLED",
                    finishedAt: new Date(),
                    version: { increment: 1 },
                  },
                }),
              ]
            : []),
        ]);
      }
    }
    await this.audit.record({
      actor,
      action: "CODEX_TASK_CANCEL",
      resourceType: "DevelopmentTask",
      resourceId: taskId,
      projectId: task.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
    });
    return this.get(taskId);
  }

  events(codexRunId: string, afterSequence: number) {
    return prisma.codexRunEvent.findMany({
      where: { codexRunId, sequence: { gt: afterSequence } },
      select: {
        id: true,
        codexRunId: true,
        sequence: true,
        eventType: true,
        level: true,
        message: true,
        createdAt: true,
      },
      orderBy: { sequence: "asc" },
      take: 200,
    });
  }

  private async enqueue(taskId: string, codexRunId: string, jobRecordId: string): Promise<void> {
    const job = await this.queue.add(
      "codex-execution",
      { developmentTaskId: taskId, codexRunId, jobRecordId },
      {
        jobId: jobRecordId,
        attempts: Number(process.env.CODEX_JOB_MAX_ATTEMPTS ?? 3),
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
    await prisma.job.update({
      where: { id: jobRecordId },
      data: { externalJobId: String(job.id) },
    });
  }
}
