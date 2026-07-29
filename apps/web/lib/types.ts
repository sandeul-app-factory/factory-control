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
