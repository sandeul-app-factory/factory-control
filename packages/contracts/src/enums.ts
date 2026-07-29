export const roles = [
  "CEO",
  "PM",
  "DEVELOPER",
  "REVIEWER",
  "SECURITY_REVIEWER",
  "READ_ONLY",
] as const;
export type Role = (typeof roles)[number];

export const projectStatuses = [
  "IDEA",
  "RESEARCHING",
  "PRD_DRAFT",
  "PRD_REVIEW",
  "REVISION_REQUIRED",
  "PRD_APPROVED",
  "PRD_LOCKED",
  "REPO_BOOTSTRAPPING",
  "REPO_READY",
  "DEVELOPMENT_QUEUED",
  "DEVELOPING",
  "CODE_REVIEW",
  "QA_TESTING",
  "SECURITY_REVIEW",
  "RELEASE_CANDIDATE",
  "FINAL_APPROVAL",
  "SIGNED",
  "BUILT",
  "RELEASED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const approvalActions = [
  "APPROVE",
  "CONDITIONAL_APPROVE",
  "REQUEST_REVISION",
  "REJECT",
  "HOLD",
  "ADD_FEATURE",
  "EXCLUDE_FEATURE",
  "CHANGE_PRIORITY",
  "CHANGE_TARGET_USER",
  "CHANGE_REVENUE_MODEL",
  "ADD_TECHNICAL_CONSTRAINT",
  "ADD_SECURITY_CONSTRAINT",
  "CHANGE_RELEASE_SCOPE",
  "ACCEPT_RISK",
] as const;
export type ApprovalAction = (typeof approvalActions)[number];

export const taskTypes = [
  "REPO_BOOTSTRAP",
  "IMPLEMENT_PRD",
  "IMPLEMENT_FEATURE",
  "FIX_REVIEW",
  "FIX_TEST",
  "FIX_SECURITY",
  "REFACTOR_APPROVED_SCOPE",
  "BUILD_RELEASE_CANDIDATE",
  "GENERATE_DOCUMENTATION",
] as const;
export type DevelopmentTaskType = (typeof taskTypes)[number];

export const taskStatuses = [
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "DEAD_LETTER",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const artifactKinds = [
  "RESEARCH",
  "PRD",
  "UX",
  "SECURITY",
  "SOURCE_SNAPSHOT",
  "CODEX_RESULT",
  "TEST_REPORT",
  "SECURITY_REPORT",
  "SBOM",
  "APK",
  "AAB",
  "BUILD_LOG",
  "OTHER",
] as const;
export type ArtifactKind = (typeof artifactKinds)[number];

export const securitySeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
export type SecuritySeverity = (typeof securitySeverities)[number];

export const logicalFolders = [
  "01 Research",
  "02 Product",
  "03 UX",
  "04 Security",
  "05 Development",
  "06 Test Reports",
  "07 Security Reports",
  "08 Builds",
  "09 Release",
] as const;
export type LogicalFolder = (typeof logicalFolders)[number];
