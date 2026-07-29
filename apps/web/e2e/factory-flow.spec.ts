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
    },
  });
}

async function uploadArtifact(
  request: APIRequestContext,
  csrfToken: string,
  projectId: string,
  kind: "SBOM" | "APK",
  folder: "07 Security Reports" | "08 Builds",
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  return api<Artifact>(
    request,
    `/projects/${projectId}/artifacts/${kind}/${encodeURIComponent(folder)}`,
    {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
      multipart: { file },
    },
  );
}

async function openProject(page: Page, projectName: string) {
  await page.reload();
  await expect(page.getByRole("heading", { name: "앱 제작 현황" })).toBeVisible();
  await page.getByText(projectName, { exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
}

test("CEO가 PRD부터 Release Candidate 승인까지 공장 전체 흐름을 통제한다", async ({ page }) => {
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
  await projectDialog.getByLabel("프로젝트 요약").fill("Factory v2 전체 인수 E2E");
  await projectDialog.getByRole("button", { name: "프로젝트 생성" }).click();
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();

  const projects = await api<Project[]>(request, "/projects");
  const project = projects.find((item) => item.slug === slug);
  expect(project).toBeDefined();

  const prd1 = await uploadPrd(
    request,
    auth.csrfToken,
    project!.id,
    "prd-v1.md",
    "# Factory E2E\n\n## 목표\n\n초기 요구사항",
  );
  const prd2 = await uploadPrd(
    request,
    auth.csrfToken,
    project!.id,
    "prd-v2.md",
    "# Factory E2E\n\n## 목표\n\n코멘트와 조건부 승인을 포함한 요구사항",
  );
  expect(prd2.versionNumber).toBe(prd1.versionNumber + 1);

  await api(request, `/projects/${project!.id}/prd-comments`, {
    ...mutation(auth.csrfToken, {
      prdVersionId: prd2.id,
      body: "승인 전에 보안 제약을 명시해야 합니다.",
      anchorStart: 0,
      anchorEnd: 12,
    }),
  });
  await api(request, `/projects/${project!.id}/constraints`, {
    ...mutation(auth.csrfToken, {
      title: "Signing key 격리",
      detail: "Codex Worker는 실제 Android signing key에 접근할 수 없습니다.",
      scope: "빌드와 배포",
      priority: "CRITICAL",
      mandatory: true,
      appliesPrdVersionId: prd2.id,
      reason: "빌드 실행 조직과 서명 권한을 분리하기 위해서입니다.",
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
      appliesPrdVersionId: prd2.id,
      reason: "실패를 성공으로 표시하지 않기 위해서입니다.",
    }),
  });
  await api(request, `/prd-versions/${prd2.id}/request-review`, mutation(auth.csrfToken));
  await api(request, `/prd-versions/${prd2.id}/approvals`, {
    ...mutation(auth.csrfToken, {
      action: "CONDITIONAL_APPROVE",
      title: "보안 제약 반영 조건부 승인",
      detail: "Signing 분리와 Release Gate를 PRD에 반영합니다.",
      scope: "전체 PRD",
      priority: "HIGH",
      mandatory: true,
      reason: "수정 버전 검토가 필요합니다.",
    }),
  });

  const prd3 = await uploadPrd(
    request,
    auth.csrfToken,
    project!.id,
    "prd-v3.md",
    "# Factory E2E\n\n## 목표\n\n보안 제약과 Release Gate가 반영된 최종 요구사항",
  );
  await api(request, `/prd-versions/${prd3.id}/request-review`, mutation(auth.csrfToken));
  await api(request, `/prd-versions/${prd3.id}/approvals`, {
    ...mutation(auth.csrfToken, {
      action: "APPROVE",
      title: "최종 PRD 승인",
      detail: "조건이 모두 반영되었습니다.",
      scope: "전체 PRD",
      priority: "CRITICAL",
      mandatory: true,
      reason: "개발 기준으로 확정합니다.",
    }),
  });
  await api(request, `/prd-versions/${prd3.id}/lock`, mutation(auth.csrfToken));

  const diff = await api<JsonRecord>(request, `/prd-versions/${prd2.id}/diff/${prd3.id}`);
  expect(diff).toBeTruthy();

  await openProject(page, projectName);
  const main = page.locator("main");
  await main.getByRole("button", { name: "PRD", exact: true }).click();
  await expect(main.getByText("PRD v3", { exact: true })).toBeVisible();
  await expect(main.getByText("LOCKED", { exact: true }).first()).toBeVisible();

  const repository = await api<{ id: string; defaultBranch: string }>(
    request,
    `/projects/${project!.id}/repository/create`,
    {
      ...mutation(auth.csrfToken, {
        owner: "sandeul-e2e",
        name: slug,
        description: "Fake GitHub Adapter E2E",
        private: true,
      }),
    },
  );
  const task = await api<TaskDetail>(request, `/projects/${project!.id}/tasks`, {
    ...mutation(auth.csrfToken, {
      type: "IMPLEMENT_PRD",
      title: "잠긴 PRD 구현",
      instruction: "잠긴 PRD의 승인 범위만 구현하고 결과를 구조화해 보고합니다.",
      acceptanceCriteria: ["핵심 흐름 E2E 통과", "Release Gate 통과"],
      targetRepositoryId: repository.id,
      targetBranch: repository.defaultBranch,
      allowedPaths: ["app/**", "docs/**"],
      deniedPaths: ["infra/**"],
      idempotencyKey: `e2e-${suffix}-implement`,
    }),
  });

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

  await openProject(page, projectName);
  await main.getByRole("button", { name: "개발 작업", exact: true }).click();
  await expect(main.getByRole("heading", { name: "실행 로그" })).toBeVisible();
  await expect(main.getByRole("link", { name: /Pull Request #\d+ 열기/ })).toBeVisible();
  await main.getByRole("button", { name: "코드 변경", exact: true }).click();
  await expect(main.getByRole("heading", { name: "Git diff" })).toBeVisible();
  await expect(main.getByText("FakeCodexAdapter E2E artifact")).toBeVisible();

  const testRun = await api<{ id: string }>(request, `/projects/${project!.id}/test-runs`, {
    ...mutation(auth.csrfToken, {
      commitSha,
      developmentTaskId: task.id,
      codexRunId: completedRun!.id,
      status: "PASSED",
      command: "pnpm test && pnpm typecheck",
      summary: {
        total: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
        acceptanceCriteriaMet: true,
      },
      results: [
        { suite: "Factory E2E", name: "핵심 흐름", status: "PASSED" },
        { suite: "Factory E2E", name: "Release Gate 입력", status: "PASSED" },
      ],
    }),
  });
  const sbom = await uploadArtifact(
    request,
    auth.csrfToken,
    project!.id,
    "SBOM",
    "07 Security Reports",
    {
      name: "factory-e2e.spdx.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          SPDXID: "SPDXRef-DOCUMENT",
          spdxVersion: "SPDX-2.3",
          name: projectName,
        }),
      ),
    },
  );
  const scan = await api<SecurityScan>(request, `/projects/${project!.id}/security-scans`, {
    ...mutation(auth.csrfToken, {
      commitSha,
      developmentTaskId: task.id,
      scanner: "COMPOSITE",
      status: "PASSED",
      sbomArtifactId: sbom.id,
      findings: [
        {
          fingerprint: `e2e-info-${suffix}`,
          severity: "INFO",
          ruleId: "FACTORY-E2E-INFO",
          title: "E2E informational finding",
          description: "Release를 차단하지 않는 추적용 Finding입니다.",
          remediation: "운영 검토 기록을 유지합니다.",
        },
      ],
    }),
  });
  const apk = await uploadArtifact(request, auth.csrfToken, project!.id, "APK", "08 Builds", {
    name: "factory-e2e.apk",
    mimeType: "application/vnd.android.package-archive",
    buffer: Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64"),
  });
  const build = await api<{ id: string }>(request, `/projects/${project!.id}/builds`, {
    ...mutation(auth.csrfToken, {
      commitSha,
      developmentTaskId: task.id,
      status: "SUCCEEDED",
      buildType: "UNSIGNED_RELEASE",
      artifactVersionId: apk.versions[0]!.id,
    }),
  });
  const gateInput = {
    buildId: build.id,
    testRunId: testRun.id,
    securityScanId: scan.id,
  };
  const gate = await api<{ passed: boolean }>(
    request,
    `/projects/${project!.id}/release-gate`,
    mutation(auth.csrfToken, gateInput),
  );
  expect(gate.passed).toBe(true);
  const release = await api<Release>(
    request,
    `/projects/${project!.id}/releases`,
    mutation(auth.csrfToken, gateInput),
  );
  expect(release.status).toBe("CANDIDATE");

  await openProject(page, projectName);
  await main.getByRole("button", { name: "테스트", exact: true }).click();
  await expect(main.getByText("Acceptance Criteria: 충족")).toBeVisible();
  await main.getByRole("button", { name: "보안", exact: true }).click();
  await expect(main.getByText("E2E informational finding")).toBeVisible();
  await main.getByRole("button", { name: "빌드", exact: true }).click();
  await expect(main.getByText("CANDIDATE", { exact: true })).toBeVisible();
  await main.getByPlaceholder("최종 승인 사유").fill("E2E 검증 결과 Release Candidate 승인");
  await main.getByRole("button", { name: "Release Candidate 승인" }).click();
  await expect(main.getByText("APPROVED", { exact: true })).toBeVisible();

  const download = await api<{ url: string }>(
    request,
    `/artifact-versions/${apk.versions[0]!.id}/download`,
  );
  const downloaded = await request.get(download.url);
  expect(downloaded.ok()).toBeTruthy();
  expect(await downloaded.body()).toEqual(
    Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64"),
  );

  const finalProject = await api<Project>(request, `/projects/${project!.id}`);
  expect(finalProject.status).toBe("FINAL_APPROVAL");
  const audits = await api<{ items: Array<{ action: string }> }>(request, "/audit-logs");
  expect(audits.items.some((entry) => entry.action === "RELEASE_APPROVE")).toBe(true);
  expect(audits.items.some((entry) => entry.action === "FILE_DOWNLOAD")).toBe(true);

  const navigation = page.getByRole("navigation", { name: "주 메뉴" });
  await navigation.getByRole("button", { name: "감사 로그" }).click();
  await expect(page.getByRole("heading", { name: "감사 로그" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "RELEASE_APPROVE" }).first()).toBeVisible();
  await navigation.getByRole("button", { name: "설정" }).click();
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MCP Credential" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Session 강제 종료" })).toBeVisible();
});
