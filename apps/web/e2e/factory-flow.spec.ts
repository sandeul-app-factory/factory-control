import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type JsonRecord = Record<string, unknown>;

interface AuthState {
  csrfToken: string;
}

interface Project extends JsonRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  repository?: { id: string; defaultBranch: string };
}

interface PrdVersion extends JsonRecord {
  id: string;
  versionNumber: number;
  status: string;
  sha256: string;
}

interface Artifact extends JsonRecord {
  id: string;
  kind: string;
  versions: Array<{ id: string; sha256: string }>;
}

interface TaskDetail extends JsonRecord {
  id: string;
  status: string;
  runs: Array<{
    id: string;
    status: string;
    commitSha?: string;
    pullRequestUrl?: string;
    gitDiff?: string;
  }>;
}

interface SecurityScan extends JsonRecord {
  id: string;
  findings: Array<{ id: string; severity: string }>;
}

interface Release extends JsonRecord {
  id: string;
  status: string;
}

function buildReadyMarkdown(detail: string): string {
  return `# Factory E2E Android Build-ready PRD

## 문서 메타데이터
- Schema: android-build-ready/v1
- 담당자: 산들, 수빈
- 문서 버전: 1.0.0

## 제품 정의
${detail}

## 출시 범위
- 핵심 흐름 E2E
- 실제 Android signing 제외

## 사용자 여정
- 앱 실행 → 핵심 액션 → 결과 확인

## 화면 명세
- SCR-001 홈: INITIAL, LOADING, CONTENT, EMPTY, ERROR, OFFLINE

## 기능 요구사항
- FR-001 핵심 액션을 중복 없이 실행한다.

## 데이터 명세
- 민감정보를 저장하지 않는다.

## API 명세
- 외부 API 없음

## Android 기술 기준
- applicationId: work.sandeul.factorye2e
- minSdk: 23
- targetSdk: 36
- compileSdk: 36
- Java toolchain: 17

## 권한
- Android runtime permission 없음

## 보안
- release debuggable: false
- TLS 우회 금지
- signing key 접근 금지

## 개인정보
- 개인정보 수집 없음

## 디자인
- Material 3

## 빌드
- ./gradlew assembleDebug
- ./gradlew bundleRelease

## 테스트
- Unit, Android Lint, detekt, ktlint, 설치 Smoke Test

## Acceptance Criteria
- 핵심 흐름 E2E 통과
- Release Gate 통과

## Release Gate
- CRITICAL 0, HIGH 0, SBOM 필수

## 가정 및 미결정 사항
- 실제 signing은 별도 Worker 범위

## 위험
- 외부 스토어 심사 일정
`;
}

async function api<T>(
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const headers = {
    ...(options.headers ?? {}),
    ...(["GET", "HEAD", "OPTIONS"].includes(method)
      ? {}
      : { origin: new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").origin }),
  };
  const response = await request.fetch(`/api${path}`, { ...options, headers });
  const text = await response.text();
  expect(response.ok(), `${method} ${path}: ${text}`).toBeTruthy();
  return (text ? JSON.parse(text) : {}) as T;
}

function mutation(csrfToken: string, data?: unknown) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
    },
    ...(data === undefined ? {} : { data }),
  } as const;
}

async function uploadPrd(
  request: APIRequestContext,
  csrfToken: string,
  projectId: string,
  name: string,
  markdown: string,
  submitForReview = false,
) {
  return api<PrdVersion>(request, `/projects/${projectId}/prds`, {
    method: "POST",
    headers: { "x-csrf-token": csrfToken },
    multipart: {
      file: {
        name,
        mimeType: "text/markdown",
        buffer: Buffer.from(markdown, "utf8"),
      },
      acceptanceCriteria: JSON.stringify(["핵심 흐름 E2E 통과", "Release Gate 통과"]),
      includedArtifactIds: "[]",
      excludedScope: JSON.stringify(["실제 Android signing"]),
      submitForReview: String(submitForReview),
    },
  });
}

async function openProject(page: Page, projectName: string) {
  await page.reload();
  await expect(page.getByRole("heading", { name: "앱 제작 현황" })).toBeVisible();
  await page.getByText(projectName, { exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
}

test("PRD·디자인·Repository부터 Codex 검증·빌드까지 실행한다", async ({ page }) => {
  const loginId = process.env.E2E_ADMIN_LOGIN_ID;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!loginId || !password, "E2E_ADMIN_LOGIN_ID와 E2E_ADMIN_PASSWORD가 필요합니다.");

  await page.goto("/");
  await page.getByLabel("이메일 또는 관리자 ID").fill(loginId!);
  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "Control Center 열기" }).click();
  await expect(page.getByRole("heading", { name: "앱 제작 현황" })).toBeVisible();

  const request = page.context().request;
  const auth = await api<AuthState>(request, "/auth/me");
  const suffix = Date.now().toString(36);
  const projectName = `Factory E2E ${suffix}`;
  const slug = `factory-e2e-${suffix}`;

  await page.getByRole("button", { name: "새 프로젝트" }).click();
  const projectDialog = page.getByRole("dialog", { name: "새 프로젝트 만들기" });
  await projectDialog.getByLabel("프로젝트 이름").fill(projectName);
  await projectDialog.getByLabel("식별자").fill(slug);
  await projectDialog.getByLabel("프로젝트 요약").fill("Factory v2 통합 인수 E2E");
  await projectDialog.getByRole("button", { name: "프로젝트 생성" }).click();
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();

  const projects = await api<Project[]>(request, "/projects");
  const project = projects.find((item) => item.slug === slug);
  expect(project).toBeDefined();

  const schema = await api<{ properties: { schemaVersion: { const: string } } }>(
    request,
    "/prd-authoring/schema",
  );
  expect(schema.properties.schemaVersion.const).toBe("android-build-ready/v1");

  const prd1 = await uploadPrd(
    request,
    auth.csrfToken,
    project!.id,
    "prd-v1.md",
    buildReadyMarkdown("초기 요구사항"),
  );
  expect(prd1.status).toBe("LOCKED");

  await api(request, `/projects/${project!.id}/constraints`, {
    ...mutation(auth.csrfToken, {
      title: "Signing key 격리",
      detail: "Codex Worker는 실제 Android signing key에 접근할 수 없습니다.",
      scope: "빌드와 배포",
      priority: "CRITICAL",
      mandatory: true,
      appliesPrdVersionId: prd1.id,
      reason: "빌드 실행 조직과 서명 권한을 분리합니다.",
    }),
  });
  await api(request, `/projects/${project!.id}/decisions`, {
    ...mutation(auth.csrfToken, {
      action: "ADD_SECURITY_CONSTRAINT",
      title: "Release Gate 강제",
      detail: "테스트, 보안검사, SBOM, 빌드를 모두 검증합니다.",
      scope: "Release Candidate",
      priority: "HIGH",
      mandatory: true,
      appliesPrdVersionId: prd1.id,
      reason: "실패를 성공으로 표시하지 않습니다.",
    }),
  });

  const prd2 = await uploadPrd(
    request,
    auth.csrfToken,
    project!.id,
    "prd-v2.md",
    buildReadyMarkdown("보안 제약과 Release Gate가 반영된 최종 요구사항"),
  );
  expect(prd2.versionNumber).toBe(prd1.versionNumber + 1);
  expect(prd2.status).toBe("LOCKED");

  const diff = await api<JsonRecord>(request, `/prd-versions/${prd1.id}/diff/${prd2.id}`);
  expect(diff).toBeTruthy();

  await openProject(page, projectName);
  const main = page.locator("main");
  await expect(main.getByText("PRD 준비", { exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "작성 가이드" })).toHaveAttribute(
    "href",
    "/templates/SANDEUL_ANDROID_PRD_GUIDE.md",
  );
  await expect(main.getByText("PRD v2", { exact: true })).toBeVisible();
  await expect(main.getByText("LOCKED", { exact: true }).first()).toBeVisible();

  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
    "base64",
  );
  await main.getByLabel("디자인 파일 다중 선택").setInputFiles([
    { name: "01_홈.png", mimeType: "image/png", buffer: pixel },
    { name: "02_메모작성.png", mimeType: "image/png", buffer: pixel },
    {
      name: "design-spec.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# 디자인 스펙\n\n## 01_홈\n메인 버튼은 메모 작성 화면으로 이동한다.\n\n## 02_메모작성\n저장 버튼은 입력 완료 후 활성화한다.",
        "utf8",
      ),
    },
  ]);
  await expect(main.getByText("통합 MD 스펙 포함", { exact: true })).toBeVisible();
  await main.getByRole("button", { name: "디자인 자료 3개 업로드" }).click();
  await expect(main.getByText(/디자인 자료 3개를 업로드했습니다/)).toBeVisible();
  const designSection = page.locator("#project-design");
  await expect(designSection.getByText("01_홈.png", { exact: true })).toBeVisible();
  await expect(designSection.getByText("design-spec.md", { exact: true })).toBeVisible();

  const repository = await api<{
    id: string;
    defaultBranch: string;
    development: { prepared: boolean; task: TaskDetail };
  }>(request, `/projects/${project!.id}/repository/create`, {
    ...mutation(auth.csrfToken, {
      owner: "sandeul-e2e",
      name: slug,
      description: "Fake GitHub Adapter E2E",
      private: true,
    }),
  });
  expect(repository.development.prepared).toBe(true);
  const task = repository.development.task;
  expect(task.status).toBe("DRAFT");
  await api<TaskDetail>(request, `/tasks/${task.id}/start`, mutation(auth.csrfToken));

  await expect
    .poll(async () => (await api<TaskDetail>(request, `/tasks/${task.id}`)).status, {
      timeout: 45_000,
    })
    .toBe("SUCCEEDED");
  const completedTask = await api<TaskDetail>(request, `/tasks/${task.id}`);
  const completedRun = completedTask.runs.find((run) => run.status === "SUCCEEDED");
  expect(completedRun?.commitSha).toMatch(/^[0-9a-f]{40}$/);
  expect(completedRun?.pullRequestUrl).toContain("github.com");
  const commitSha = completedRun!.commitSha!;

  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "개발 작업" })
    .click();
  await expect(main.getByRole("heading", { name: "진행 요약" })).toBeVisible();
  await expect(main.getByRole("link", { name: /Pull Request #\d+ 열기/ })).toBeVisible();
  await expect(main.getByRole("heading", { name: "변경 요약" })).toBeVisible();
  await expect(
    main.getByText("app/src/main/java/work/sandeul/factory/FakeFeature.kt"),
  ).toBeVisible();
  await expect(main.getByText("Release Candidate", { exact: true })).toBeVisible();

  const [testRuns, scans, builds, releases, artifacts] = await Promise.all([
    api<Array<{ id: string; commitSha: string; status: string }>>(
      request,
      `/projects/${project!.id}/test-runs`,
    ),
    api<SecurityScan[]>(request, `/projects/${project!.id}/security-scans`),
    api<Array<{ id: string; commitSha: string; status: string; artifactVersionId: string }>>(
      request,
      `/projects/${project!.id}/builds`,
    ),
    api<Release[]>(request, `/projects/${project!.id}/releases`),
    api<Artifact[]>(request, `/projects/${project!.id}/artifacts`),
  ]);
  expect(testRuns.find((run) => run.commitSha === commitSha)?.status).toBe("PASSED");
  expect(scans.find((scan) => scan.commitSha === commitSha)?.status).toBe("PASSED");
  expect(builds.find((build) => build.commitSha === commitSha)?.status).toBe("SUCCEEDED");
  expect(releases.find((release) => release.commitSha === commitSha)?.status).toBe("CANDIDATE");
  const apk = artifacts.find((artifact) => artifact.kind === "APK")!;
  expect(apk).toBeDefined();

  const download = await api<{ url: string }>(
    request,
    `/artifact-versions/${apk.versions[0]!.id}/download`,
  );
  const downloaded = await request.get(download.url);
  expect(downloaded.ok()).toBeTruthy();

  const finalProject = await api<Project>(request, `/projects/${project!.id}`);
  expect(finalProject.status).toBe("RELEASE_CANDIDATE");
  const audits = await api<{ items: Array<{ action: string }> }>(request, "/audit-logs");
  expect(audits.items.some((entry) => entry.action === "PRD_AUTO_LOCK")).toBe(true);
  expect(audits.items.some((entry) => entry.action === "FILE_DOWNLOAD")).toBe(true);

  const navigation = page.getByRole("navigation", { name: "주 메뉴" });
  await navigation.getByRole("button", { name: "감사 로그" }).click();
  await expect(page.getByRole("heading", { name: "감사 로그" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "PRD_AUTO_LOCK" }).first()).toBeVisible();
  await navigation.getByRole("button", { name: "설정" }).click();
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MCP Credential" })).toBeVisible();
});
