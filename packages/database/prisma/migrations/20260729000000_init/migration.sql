-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CEO', 'PM', 'DEVELOPER', 'REVIEWER', 'SECURITY_REVIEWER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('IDEA', 'RESEARCHING', 'PRD_DRAFT', 'PRD_REVIEW', 'REVISION_REQUIRED', 'PRD_APPROVED', 'PRD_LOCKED', 'REPO_BOOTSTRAPPING', 'REPO_READY', 'DEVELOPMENT_QUEUED', 'DEVELOPING', 'CODE_REVIEW', 'QA_TESTING', 'SECURITY_REVIEW', 'RELEASE_CANDIDATE', 'FINAL_APPROVAL', 'SIGNED', 'BUILT', 'RELEASED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('RESEARCH', 'PRD', 'UX', 'SECURITY', 'SOURCE_SNAPSHOT', 'CODEX_RESULT', 'TEST_REPORT', 'SECURITY_REPORT', 'SBOM', 'APK', 'AAB', 'BUILD_LOG', 'OTHER');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('ACTIVE', 'QUARANTINED', 'DELETED');

-- CreateEnum
CREATE TYPE "PrdStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'LOCKED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('APPROVE', 'CONDITIONAL_APPROVE', 'REQUEST_REVISION', 'REJECT', 'HOLD', 'ADD_FEATURE', 'EXCLUDE_FEATURE', 'CHANGE_PRIORITY', 'CHANGE_TARGET_USER', 'CHANGE_REVENUE_MODEL', 'ADD_TECHNICAL_CONSTRAINT', 'ADD_SECURITY_CONSTRAINT', 'CHANGE_RELEASE_SCOPE', 'ACCEPT_RISK');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "GithubAuthMode" AS ENUM ('APP', 'FINE_GRAINED_PAT', 'FAKE');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('REPO_BOOTSTRAP', 'IMPLEMENT_PRD', 'IMPLEMENT_FEATURE', 'FIX_REVIEW', 'FIX_TEST', 'FIX_SECURITY', 'REFACTOR_APPROVED_SCOPE', 'BUILD_RELEASE_CANDIDATE', 'GENERATE_DOCUMENTATION');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "CodexRunStatus" AS ENUM ('QUEUED', 'STARTING', 'RUNNING', 'CANCELLING', 'CANCELLED', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'FIXED', 'FALSE_POSITIVE', 'RISK_ACCEPTED');

-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('QUEUED', 'BUILDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'GATE_BLOCKED', 'CANDIDATE', 'APPROVED', 'SIGNING', 'SIGNED', 'RELEASED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "loginId" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CEO',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "csrfToken" VARCHAR(128) NOT NULL,
    "ipHash" CHAR(64),
    "userAgent" VARCHAR(500),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "status" "ProjectStatus" NOT NULL DEFAULT 'IDEA',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStateHistory" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "previousStatus" "ProjectStatus" NOT NULL,
    "newStatus" "ProjectStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "artifactId" UUID,
    "decisionRecordId" UUID,
    "taskId" UUID,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "logicalFolder" VARCHAR(100) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactVersion" (
    "id" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "originalName" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(200) NOT NULL,
    "extension" VARCHAR(30) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "metadata" JSONB,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrdVersion" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "PrdStatus" NOT NULL DEFAULT 'DRAFT',
    "canonicalFormat" VARCHAR(20) NOT NULL,
    "contentMarkdown" TEXT,
    "contentJson" JSONB,
    "sha256" CHAR(64) NOT NULL,
    "sourceArtifactVersionId" UUID,
    "acceptanceCriteria" JSONB NOT NULL,
    "includedArtifactIds" JSONB NOT NULL,
    "excludedScope" JSONB NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "lockedBy" UUID,
    "lockedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PrdVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrdSection" (
    "id" UUID NOT NULL,
    "prdVersionId" UUID NOT NULL,
    "heading" VARCHAR(500) NOT NULL,
    "anchor" VARCHAR(200) NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentSha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PrdSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrdComment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "prdVersionId" UUID NOT NULL,
    "sectionId" UUID,
    "body" TEXT NOT NULL,
    "anchorStart" INTEGER,
    "anchorEnd" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "createdBy" UUID NOT NULL,
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PrdComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoConstraint" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "logicalId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "detail" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "appliesPrdVersionId" UUID,
    "appliesTaskId" UUID,
    "effectiveAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CeoConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRecord" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "logicalId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "action" "ApprovalAction",
    "title" VARCHAR(300) NOT NULL,
    "detail" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "appliesPrdVersionId" UUID,
    "appliesTaskId" UUID,
    "effectiveAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "prdVersionId" UUID,
    "developmentTaskId" UUID,
    "releaseId" UUID,
    "action" "ApprovalAction" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "detail" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "mandatory" BOOLEAN NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubRepository" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "externalId" VARCHAR(200) NOT NULL,
    "owner" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "htmlUrl" VARCHAR(1000) NOT NULL,
    "defaultBranch" VARCHAR(255) NOT NULL,
    "authMode" "GithubAuthMode" NOT NULL,
    "installationId" VARCHAR(200),
    "lastSyncedAt" TIMESTAMP(3),
    "status" VARCHAR(30) NOT NULL DEFAULT 'CONNECTED',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GithubRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "deliveryId" VARCHAR(200) NOT NULL,
    "eventName" VARCHAR(100) NOT NULL,
    "signature" VARCHAR(200),
    "payloadSha256" CHAR(64) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentTask" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "type" "TaskType" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "targetRepositoryId" UUID,
    "targetBranch" VARCHAR(255) NOT NULL,
    "targetCommitSha" CHAR(40),
    "lockedPrdVersionId" UUID NOT NULL,
    "lockedPrdSha256" CHAR(64) NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL,
    "allowedPaths" JSONB NOT NULL,
    "deniedPaths" JSONB NOT NULL,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "currentInstructionId" UUID,
    "cancellationRequestedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DevelopmentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskInstructionVersion" (
    "id" UUID NOT NULL,
    "developmentTaskId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "instructionSha256" CHAR(64) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskInstructionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodexRun" (
    "id" UUID NOT NULL,
    "developmentTaskId" UUID NOT NULL,
    "instructionVersionId" UUID NOT NULL,
    "status" "CodexRunStatus" NOT NULL DEFAULT 'QUEUED',
    "adapter" VARCHAR(30) NOT NULL,
    "promptSha256" CHAR(64),
    "workspacePath" VARCHAR(1000),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "exitCode" INTEGER,
    "resultJson" JSONB,
    "finalMessage" TEXT,
    "gitDiff" TEXT,
    "commitSha" CHAR(40),
    "pullRequestNumber" INTEGER,
    "pullRequestUrl" VARCHAR(1000),
    "errorCode" VARCHAR(100),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CodexRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodexRunEvent" (
    "id" UUID NOT NULL,
    "codexRunId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "level" VARCHAR(20) NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodexRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "developmentTaskId" UUID,
    "externalJobId" VARCHAR(200),
    "queueName" VARCHAR(100) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "developmentTaskId" UUID,
    "codexRunId" UUID,
    "commitSha" CHAR(40) NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "command" VARCHAR(500) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "reportArtifactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" UUID NOT NULL,
    "testRunId" UUID NOT NULL,
    "suite" VARCHAR(500) NOT NULL,
    "name" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "durationMs" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityScan" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "developmentTaskId" UUID,
    "commitSha" CHAR(40) NOT NULL,
    "scanner" VARCHAR(100) NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "sbomArtifactId" UUID,
    "reportArtifactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityFinding" (
    "id" UUID NOT NULL,
    "securityScanId" UUID NOT NULL,
    "fingerprint" VARCHAR(300) NOT NULL,
    "severity" "SecuritySeverity" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "ruleId" VARCHAR(200) NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "description" TEXT NOT NULL,
    "filePath" VARCHAR(1000),
    "line" INTEGER,
    "remediation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SecurityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAcceptance" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "securityFindingId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "acceptedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RiskAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "developmentTaskId" UUID,
    "commitSha" CHAR(40) NOT NULL,
    "prdSha256" CHAR(64) NOT NULL,
    "status" "BuildStatus" NOT NULL DEFAULT 'QUEUED',
    "buildType" VARCHAR(100) NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "artifactVersionId" UUID,
    "artifactSha256" CHAR(64),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "buildId" UUID NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "commitSha" CHAR(40) NOT NULL,
    "prdVersionId" UUID NOT NULL,
    "prdSha256" CHAR(64) NOT NULL,
    "testRunId" UUID NOT NULL,
    "securityScanId" UUID NOT NULL,
    "gateReport" JSONB,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" VARCHAR(50),
    "action" VARCHAR(150) NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(200),
    "projectId" UUID,
    "requestId" VARCHAR(100) NOT NULL,
    "ipHash" CHAR(64),
    "userAgent" VARCHAR(500),
    "outcome" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpCredential" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "scopes" JSONB NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 30,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "McpCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "actorId" UUID,
    "operation" VARCHAR(100) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "lockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_deletedAt_idx" ON "User"("status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_status_deletedAt_updatedAt_idx" ON "Project"("status", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "ProjectStateHistory_projectId_createdAt_idx" ON "ProjectStateHistory"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Artifact_projectId_logicalFolder_status_idx" ON "Artifact"("projectId", "logicalFolder", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_objectKey_key" ON "ArtifactVersion"("objectKey");

-- CreateIndex
CREATE INDEX "ArtifactVersion_sha256_idx" ON "ArtifactVersion"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_versionNumber_key" ON "ArtifactVersion"("artifactId", "versionNumber");

-- CreateIndex
CREATE INDEX "PrdVersion_projectId_status_createdAt_idx" ON "PrdVersion"("projectId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrdVersion_projectId_versionNumber_key" ON "PrdVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrdSection_prdVersionId_anchor_key" ON "PrdSection"("prdVersionId", "anchor");

-- CreateIndex
CREATE INDEX "PrdComment_prdVersionId_status_createdAt_idx" ON "PrdComment"("prdVersionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CeoConstraint_projectId_status_createdAt_idx" ON "CeoConstraint"("projectId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CeoConstraint_logicalId_versionNumber_key" ON "CeoConstraint"("logicalId", "versionNumber");

-- CreateIndex
CREATE INDEX "DecisionRecord_projectId_status_createdAt_idx" ON "DecisionRecord"("projectId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRecord_logicalId_versionNumber_key" ON "DecisionRecord"("logicalId", "versionNumber");

-- CreateIndex
CREATE INDEX "Approval_projectId_createdAt_idx" ON "Approval"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GithubRepository_projectId_key" ON "GithubRepository"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubRepository_externalId_key" ON "GithubRepository"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_deliveryId_key" ON "WebhookDelivery"("deliveryId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_eventName_createdAt_idx" ON "WebhookDelivery"("eventName", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentTask_idempotencyKey_key" ON "DevelopmentTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DevelopmentTask_projectId_status_createdAt_idx" ON "DevelopmentTask"("projectId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskInstructionVersion_developmentTaskId_versionNumber_key" ON "TaskInstructionVersion"("developmentTaskId", "versionNumber");

-- CreateIndex
CREATE INDEX "CodexRun_developmentTaskId_createdAt_idx" ON "CodexRun"("developmentTaskId", "createdAt");

-- CreateIndex
CREATE INDEX "CodexRunEvent_codexRunId_createdAt_idx" ON "CodexRunEvent"("codexRunId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodexRunEvent_codexRunId_sequence_key" ON "CodexRunEvent"("codexRunId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Job_externalJobId_key" ON "Job"("externalJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_queueName_status_createdAt_idx" ON "Job"("queueName", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TestRun_projectId_status_createdAt_idx" ON "TestRun"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TestResult_testRunId_status_idx" ON "TestResult"("testRunId", "status");

-- CreateIndex
CREATE INDEX "SecurityScan_projectId_status_createdAt_idx" ON "SecurityScan"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityFinding_severity_status_idx" ON "SecurityFinding"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityFinding_securityScanId_fingerprint_key" ON "SecurityFinding"("securityScanId", "fingerprint");

-- CreateIndex
CREATE INDEX "RiskAcceptance_projectId_securityFindingId_revokedAt_idx" ON "RiskAcceptance"("projectId", "securityFindingId", "revokedAt");

-- CreateIndex
CREATE INDEX "Build_projectId_status_createdAt_idx" ON "Build"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Release_projectId_status_createdAt_idx" ON "Release"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpCredential_name_key" ON "McpCredential"("name");

-- CreateIndex
CREATE UNIQUE INDEX "McpCredential_tokenHash_key" ON "McpCredential"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_operation_expiresAt_idx" ON "IdempotencyRecord"("operation", "expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrdSection" ADD CONSTRAINT "PrdSection_prdVersionId_fkey" FOREIGN KEY ("prdVersionId") REFERENCES "PrdVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrdComment" ADD CONSTRAINT "PrdComment_prdVersionId_fkey" FOREIGN KEY ("prdVersionId") REFERENCES "PrdVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrdComment" ADD CONSTRAINT "PrdComment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PrdSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityFinding" ADD CONSTRAINT "SecurityFinding_securityScanId_fkey" FOREIGN KEY ("securityScanId") REFERENCES "SecurityScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
