import { z } from "zod";
import {
  approvalActions,
  artifactKinds,
  logicalFolders,
  projectStatuses,
  roles,
  securitySeverities,
  taskTypes,
} from "./enums.js";

const uuid = z.uuid();
const nonEmpty = z.string().trim().min(1);

export const roleSchema = z.enum(roles);
export const projectStatusSchema = z.enum(projectStatuses);
export const approvalActionSchema = z.enum(approvalActions);
export const taskTypeSchema = z.enum(taskTypes);
export const artifactKindSchema = z.enum(artifactKinds);
export const logicalFolderSchema = z.enum(logicalFolders);
export const securitySeveritySchema = z.enum(securitySeverities);

export const loginSchema = z.object({
  loginId: z.string().trim().min(3).max(100),
  password: z.string().min(12).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(12).max(200),
  newPassword: z
    .string()
    .min(14)
    .max(200)
    .regex(/[a-z]/, "소문자가 필요합니다.")
    .regex(/[A-Z]/, "대문자가 필요합니다.")
    .regex(/[0-9]/, "숫자가 필요합니다.")
    .regex(/[^A-Za-z0-9]/, "특수문자가 필요합니다."),
});

export const createProjectSchema = z.object({
  name: nonEmpty.max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().max(2000).default(""),
});

export const transitionProjectSchema = z.object({
  to: projectStatusSchema,
  reason: nonEmpty.max(2000),
  artifactId: uuid.optional(),
  decisionRecordId: uuid.optional(),
  taskId: uuid.optional(),
  expectedVersion: z.number().int().positive(),
});

export const prdJsonSchema = z.object({
  title: nonEmpty.max(200),
  summary: nonEmpty.max(5000),
  targetUsers: z.array(nonEmpty.max(300)).min(1),
  problem: nonEmpty.max(10000),
  goals: z.array(nonEmpty.max(1000)).min(1),
  nonGoals: z.array(nonEmpty.max(1000)).default([]),
  scope: z.array(nonEmpty.max(2000)).min(1),
  acceptanceCriteria: z.array(nonEmpty.max(2000)).min(1),
  risks: z.array(nonEmpty.max(2000)).default([]),
});

export const createCommentSchema = z.object({
  prdVersionId: uuid,
  sectionId: uuid.optional(),
  body: nonEmpty.max(10000),
  anchorStart: z.number().int().nonnegative().optional(),
  anchorEnd: z.number().int().nonnegative().optional(),
});

export const decisionInputSchema = z.object({
  title: nonEmpty.max(300),
  detail: nonEmpty.max(20000),
  scope: nonEmpty.max(2000),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  mandatory: z.boolean().default(true),
  appliesPrdVersionId: uuid.optional(),
  appliesTaskId: uuid.optional(),
  effectiveAt: z.iso.datetime().optional(),
  reason: nonEmpty.max(10000),
  action: approvalActionSchema.optional(),
});

export const approvalInputSchema = decisionInputSchema.extend({
  action: approvalActionSchema,
});

export const taskInputSchema = z.object({
  projectId: uuid,
  type: taskTypeSchema,
  title: nonEmpty.max(300),
  instruction: nonEmpty.max(50000),
  acceptanceCriteria: z.array(nonEmpty.max(3000)).min(1),
  targetRepositoryId: uuid.optional(),
  targetBranch: z.string().trim().min(1).max(255),
  targetCommitSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/i)
    .optional(),
  allowedPaths: z.array(z.string().trim().min(1).max(500)).default([]),
  deniedPaths: z.array(z.string().trim().min(1).max(500)).default([]),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const repositoryInputSchema = z.object({
  projectId: uuid,
  owner: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  defaultBranch: z.string().trim().min(1).max(255).default("main"),
  htmlUrl: z.url().startsWith("https://github.com/"),
  externalId: z.string().trim().min(1).max(200),
});

export const riskAcceptanceInputSchema = z.object({
  projectId: uuid,
  securityFindingId: uuid,
  reason: nonEmpty.max(10000),
  expiresAt: z.iso.datetime().optional(),
});

const commitSha = z.string().regex(/^[0-9a-f]{40}$/i);
const completedRunStatus = z.enum(["PASSED", "FAILED", "CANCELLED"]);

export const testRunReportSchema = z.object({
  commitSha,
  developmentTaskId: uuid.optional(),
  codexRunId: uuid.optional(),
  status: completedRunStatus,
  command: nonEmpty.max(500),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
  summary: z
    .object({
      total: z.number().int().nonnegative(),
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative().default(0),
      acceptanceCriteriaMet: z.boolean(),
    })
    .refine((value) => value.passed + value.failed + value.skipped === value.total, {
      message: "테스트 합계가 일치하지 않습니다.",
    }),
  reportArtifactId: uuid.optional(),
  results: z
    .array(
      z.object({
        suite: nonEmpty.max(500),
        name: nonEmpty.max(1000),
        status: z.enum(["PASSED", "FAILED", "SKIPPED"]),
        durationMs: z.number().int().nonnegative().optional(),
        message: z.string().max(20000).optional(),
      }),
    )
    .max(10000),
});

export const securityScanReportSchema = z.object({
  commitSha,
  developmentTaskId: uuid.optional(),
  scanner: z.enum([
    "OSV",
    "SEMGREP",
    "GITLEAKS",
    "TRIVY_FS",
    "TRIVY_IMAGE",
    "ANDROID_LINT",
    "DETEKT",
    "KTLINT",
    "DEPENDENCY_SCAN",
    "MOBSF",
    "ANDROID_MANIFEST",
    "COMPOSITE",
  ]),
  status: completedRunStatus,
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
  sbomArtifactId: uuid.optional(),
  reportArtifactId: uuid.optional(),
  findings: z
    .array(
      z.object({
        fingerprint: nonEmpty.max(300),
        severity: securitySeveritySchema,
        ruleId: nonEmpty.max(200),
        title: nonEmpty.max(1000),
        description: nonEmpty.max(20000),
        filePath: z.string().trim().max(1000).optional(),
        line: z.number().int().positive().optional(),
        remediation: z.string().trim().max(20000).optional(),
      }),
    )
    .max(10000),
});

export const buildReportSchema = z.object({
  commitSha,
  developmentTaskId: uuid.optional(),
  status: z.enum(["SUCCEEDED", "FAILED"]),
  buildType: z.enum(["UNSIGNED_RELEASE", "DEBUG", "SIGNED_RELEASE"]),
  artifactVersionId: uuid.optional(),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
});

export const releaseCandidateSchema = z.object({
  buildId: uuid,
  testRunId: uuid,
  securityScanId: uuid,
});

export const releaseApprovalSchema = z.object({
  reason: nonEmpty.max(10000),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type TransitionProjectInput = z.infer<typeof transitionProjectSchema>;
export type PrdJson = z.infer<typeof prdJsonSchema>;
export type DecisionInput = z.infer<typeof decisionInputSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TestRunReportInput = z.infer<typeof testRunReportSchema>;
export type SecurityScanReportInput = z.infer<typeof securityScanReportSchema>;
export type BuildReportInput = z.infer<typeof buildReportSchema>;
