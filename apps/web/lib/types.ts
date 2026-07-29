export interface Project {
  id: string;
  name: string;
  slug: string;
  summary: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  counts?: {
    prdVersions: number;
    artifacts: number;
    openComments: number;
    tasks: number;
    openFindings: number;
    pendingApprovals: number;
  };
  repository?: {
    id: string;
    owner: string;
    name: string;
    htmlUrl: string;
    defaultBranch: string;
  } | null;
}

export interface PrdVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  status: string;
  canonicalFormat: string;
  sha256: string;
  contentMarkdown?: string | null;
  contentJson?: unknown;
  acceptanceCriteria: string[];
  includedArtifactIds: string[];
  excludedScope: string[];
  approvedAt?: string | null;
  lockedAt?: string | null;
  createdAt: string;
  sections?: Array<{
    id: string;
    heading: string;
    anchor: string;
    content: string;
    ordinal: number;
  }>;
  comments?: Array<{
    id: string;
    sectionId?: string | null;
    body: string;
    status: string;
    createdAt: string;
  }>;
  _count?: { sections: number; comments: number };
}

export interface Artifact {
  id: string;
  kind: string;
  logicalFolder: string;
  name: string;
  status: string;
  updatedAt: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    sha256: string;
    mimeType: string;
    sizeBytes: string;
    originalName: string;
  }>;
}

export interface DecisionRecord {
  id: string;
  logicalId: string;
  versionNumber: number;
  action?: string | null;
  title: string;
  detail: string;
  scope: string;
  priority: string;
  mandatory: boolean;
  reason: string;
  status: string;
  createdAt: string;
}

export interface DevelopmentTask {
  id: string;
  projectId: string;
  type: string;
  title: string;
  status: string;
  targetBranch: string;
  targetCommitSha?: string | null;
  lockedPrdSha256: string;
  acceptanceCriteria: string[];
  allowedPaths: string[];
  deniedPaths: string[];
  cancellationRequestedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevelopmentTaskDetail extends DevelopmentTask {
  repository?: {
    id: string;
    owner: string;
    name: string;
    htmlUrl: string;
    defaultBranch: string;
  } | null;
  instructions: Array<{
    id: string;
    versionNumber: number;
    instruction: string;
    instructionSha256: string;
    createdAt: string;
  }>;
  runs: Array<{
    id: string;
    status: string;
    adapter: string;
    promptSha256?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    finalMessage?: string | null;
    gitDiff?: string | null;
    commitSha?: string | null;
    pullRequestNumber?: number | null;
    pullRequestUrl?: string | null;
    errorMessage?: string | null;
    resultJson?: {
      summary?: string;
      changedFiles?: Array<{ path: string; reason: string }>;
      tests?: Array<{ command: string; status: string; summary: string }>;
      assumptions?: string[];
      incompleteItems?: string[];
    } | null;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    codexRunId: string;
    sequence: number;
    eventType: string;
    level: string;
    message: string;
    createdAt: string;
  }>;
  job?: {
    id: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    lastError?: string | null;
  } | null;
}

export interface TestRun {
  id: string;
  projectId: string;
  commitSha: string;
  status: string;
  command: string;
  summary?: {
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
    acceptanceCriteriaMet?: boolean;
    note?: string;
  } | null;
  reportArtifactId?: string | null;
  createdAt: string;
  results: Array<{
    id: string;
    suite: string;
    name: string;
    status: string;
    durationMs?: number | null;
    message?: string | null;
  }>;
}

export interface SecurityScan {
  id: string;
  projectId: string;
  commitSha: string;
  scanner: string;
  status: string;
  sbomArtifactId?: string | null;
  reportArtifactId?: string | null;
  createdAt: string;
  findings: Array<{
    id: string;
    severity: string;
    status: string;
    ruleId: string;
    title: string;
    description: string;
    filePath?: string | null;
    line?: number | null;
    remediation?: string | null;
    riskAcceptance?: {
      id: string;
      reason: string;
      expiresAt?: string | null;
      createdAt: string;
    } | null;
  }>;
}

export interface FactoryBuild {
  id: string;
  projectId: string;
  commitSha: string;
  prdSha256: string;
  status: string;
  buildType: string;
  signed: boolean;
  artifactVersionId?: string | null;
  artifactSha256?: string | null;
  createdAt: string;
}

export interface FactoryRelease {
  id: string;
  projectId: string;
  buildId: string;
  status: string;
  commitSha: string;
  prdSha256: string;
  testRunId: string;
  securityScanId: string;
  gateReport?: {
    passed?: boolean;
    blockers?: string[];
  } | null;
  approvedAt?: string | null;
  createdAt: string;
}
