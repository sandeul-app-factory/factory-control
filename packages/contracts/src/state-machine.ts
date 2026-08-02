import type { ProjectStatus } from "./enums.js";

export const allowedProjectTransitions: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> =
  {
    IDEA: ["RESEARCHING", "PRD_DRAFT", "REJECTED", "ARCHIVED"],
    RESEARCHING: ["PRD_DRAFT", "REJECTED", "ARCHIVED"],
    PRD_DRAFT: ["PRD_REVIEW", "PRD_LOCKED", "REJECTED", "ARCHIVED"],
    PRD_REVIEW: ["REVISION_REQUIRED", "PRD_APPROVED", "REJECTED"],
    REVISION_REQUIRED: ["PRD_DRAFT", "PRD_REVIEW", "REJECTED", "ARCHIVED"],
    PRD_APPROVED: ["PRD_LOCKED", "REVISION_REQUIRED", "REJECTED"],
    PRD_LOCKED: ["REPO_BOOTSTRAPPING", "REPO_READY", "ARCHIVED"],
    REPO_BOOTSTRAPPING: ["REPO_READY", "PRD_LOCKED", "REJECTED"],
    REPO_READY: ["DEVELOPMENT_QUEUED", "ARCHIVED"],
    DEVELOPMENT_QUEUED: ["DEVELOPING", "REPO_READY", "ARCHIVED"],
    DEVELOPING: ["CODE_REVIEW", "DEVELOPMENT_QUEUED", "REJECTED"],
    CODE_REVIEW: ["DEVELOPMENT_QUEUED", "QA_TESTING", "REJECTED"],
    QA_TESTING: ["DEVELOPMENT_QUEUED", "SECURITY_REVIEW", "REJECTED"],
    SECURITY_REVIEW: ["DEVELOPMENT_QUEUED", "RELEASE_CANDIDATE", "REJECTED"],
    RELEASE_CANDIDATE: ["FINAL_APPROVAL", "DEVELOPMENT_QUEUED", "REJECTED"],
    FINAL_APPROVAL: ["SIGNED", "BUILT", "DEVELOPMENT_QUEUED", "REJECTED"],
    SIGNED: ["BUILT", "REJECTED"],
    BUILT: ["RELEASED", "DEVELOPMENT_QUEUED", "REJECTED"],
    RELEASED: ["ARCHIVED"],
    REJECTED: ["IDEA", "PRD_DRAFT", "ARCHIVED"],
    ARCHIVED: [],
  };

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return allowedProjectTransitions[from].includes(to);
}

export function assertProjectTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransitionProject(from, to)) {
    throw new Error(`허용되지 않은 프로젝트 상태 전환입니다: ${from} -> ${to}`);
  }
}
