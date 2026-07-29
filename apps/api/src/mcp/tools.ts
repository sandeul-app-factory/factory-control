export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: false;
    idempotentHint: boolean;
    openWorldHint: false;
  };
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

const projectId = { type: "string", format: "uuid", description: "Factory Project UUID" };
const uuid = { type: "string", format: "uuid" };

export const mcpTools: readonly McpToolDefinition[] = [
  {
    name: "factory.list_projects",
    title: "프로젝트 목록",
    description: "삭제되지 않은 Factory 프로젝트와 현재 상태를 조회합니다.",
    inputSchema: objectSchema({}, []),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "factory.get_project",
    title: "프로젝트 조회",
    description: "프로젝트 상세, 집계, 연결된 Repository를 조회합니다.",
    inputSchema: objectSchema({ projectId }, ["projectId"]),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "factory.get_project_status",
    title: "프로젝트 상태 조회",
    description: "현재 프로젝트 상태와 변경 이력을 조회합니다.",
    inputSchema: objectSchema({ projectId }, ["projectId"]),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "factory.list_artifacts",
    title: "Artifact 목록",
    description: "프로젝트의 논리 폴더별 Artifact metadata를 조회합니다.",
    inputSchema: objectSchema({ projectId }, ["projectId"]),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "factory.read_artifact",
    title: "Artifact 읽기",
    description: "ArtifactVersion metadata와 60초 동안 유효한 다운로드 URL을 반환합니다.",
    inputSchema: objectSchema({ artifactVersionId: uuid }, ["artifactVersionId"]),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "factory.create_project",
    title: "프로젝트 생성",
    description: "IDEA 상태의 Factory 프로젝트를 생성합니다.",
    inputSchema: objectSchema(
      {
        name: { type: "string", minLength: 1, maxLength: 120 },
        slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
        summary: { type: "string", maxLength: 2000 },
      },
      ["name", "slug"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "factory.upload_prd",
    title: "PRD 업로드",
    description: "Markdown 또는 PRD Schema JSON을 새 Canonical PRD 버전으로 업로드합니다.",
    inputSchema: objectSchema(
      {
        projectId,
        format: { enum: ["MARKDOWN", "JSON"] },
        content: {
          description: "MARKDOWN 문자열 또는 PRD Schema JSON object",
        },
        acceptanceCriteria: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 2000 },
        },
        includedArtifactIds: { type: "array", items: uuid },
        excludedScope: { type: "array", items: { type: "string", maxLength: 2000 } },
      },
      ["projectId", "format", "content"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "factory.create_prd_version",
    title: "PRD 버전 생성",
    description: "기존 버전을 덮어쓰지 않고 새 Canonical PRD 버전을 생성합니다.",
    inputSchema: objectSchema(
      {
        projectId,
        format: { enum: ["MARKDOWN", "JSON"] },
        content: {},
        acceptanceCriteria: { type: "array", items: { type: "string" } },
        includedArtifactIds: { type: "array", items: uuid },
        excludedScope: { type: "array", items: { type: "string" } },
      },
      ["projectId", "format", "content"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "factory.record_ceo_constraint",
    title: "CEO Constraint 기록",
    description: "덮어쓰지 않는 CEO Constraint의 새 논리 기록을 생성합니다.",
    inputSchema: objectSchema(
      {
        projectId,
        title: { type: "string", minLength: 1, maxLength: 300 },
        detail: { type: "string", minLength: 1, maxLength: 20000 },
        scope: { type: "string", minLength: 1, maxLength: 2000 },
        priority: { enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
        mandatory: { type: "boolean" },
        appliesPrdVersionId: uuid,
        appliesTaskId: uuid,
        effectiveAt: { type: "string", format: "date-time" },
        reason: { type: "string", minLength: 1, maxLength: 10000 },
      },
      ["projectId", "title", "detail", "scope", "reason"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "factory.record_decision",
    title: "Decision Record 기록",
    description: "덮어쓰지 않는 Decision Record의 새 논리 기록을 생성합니다.",
    inputSchema: objectSchema(
      {
        projectId,
        action: {
          enum: [
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
          ],
        },
        title: { type: "string", minLength: 1, maxLength: 300 },
        detail: { type: "string", minLength: 1, maxLength: 20000 },
        scope: { type: "string", minLength: 1, maxLength: 2000 },
        priority: { enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
        mandatory: { type: "boolean" },
        appliesPrdVersionId: uuid,
        appliesTaskId: uuid,
        effectiveAt: { type: "string", format: "date-time" },
        reason: { type: "string", minLength: 1, maxLength: 10000 },
      },
      ["projectId", "action", "title", "detail", "scope", "reason"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "factory.request_prd_review",
    title: "PRD 검토 요청",
    description: "초안 또는 수정 요청 상태의 PRD 버전을 검토 상태로 전환합니다.",
    inputSchema: objectSchema({ prdVersionId: uuid }, ["prdVersionId"]),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
] as const;

export const mcpToolNames = new Set(mcpTools.map((tool) => tool.name));
