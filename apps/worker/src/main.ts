import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@sandeul/database";

interface FactoryJobData {
  developmentTaskId: string;
  jobRecordId: string;
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queueName = process.env.CODEX_QUEUE_NAME ?? "codex-tasks";
const concurrency = Number(process.env.CODEX_CONCURRENCY ?? 1);

const worker = new Worker<FactoryJobData>(
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

    // Codex execution is connected in Phase 3. The worker foundation deliberately
    // fails closed instead of pretending an unconfigured execution succeeded.
    if (!process.env.CODEX_ADAPTER) {
      throw new Error("CODEX_ADAPTER가 설정되지 않았습니다.");
    }
    return { accepted: true, developmentTaskId: job.data.developmentTaskId };
  },
  {
    connection,
    concurrency,
    lockDuration: Number(process.env.CODEX_JOB_TIMEOUT_MS ?? 1_800_000),
  },
);

worker.on("completed", (job) => {
  void prisma.job.update({
    where: { id: job.data.jobRecordId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), version: { increment: 1 } },
  });
});

worker.on("failed", (job, error) => {
  if (!job) return;
  const exhausted = job.attemptsMade >= Number(process.env.CODEX_JOB_MAX_ATTEMPTS ?? 3);
  void prisma.job.update({
    where: { id: job.data.jobRecordId },
    data: {
      status: exhausted ? "DEAD_LETTER" : "RETRYING",
      lastError: error.message.slice(0, 4000),
      ...(exhausted ? { finishedAt: new Date() } : {}),
      version: { increment: 1 },
    },
  });
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
