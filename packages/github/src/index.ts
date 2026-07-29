import { createHmac, createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { safeEqual, sha256 } from "@sandeul/security";

export interface GithubOrganization {
  login: string;
  avatarUrl?: string;
}

export interface GithubRepositoryInfo {
  id: string;
  owner: string;
  name: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
}

export interface GithubPullRequest {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  headSha: string;
}

export interface GithubCheckSummary {
  status: string;
  conclusion: string | null;
  name: string;
  detailsUrl: string | null;
}

export interface CreateRepositoryInput {
  owner: string;
  name: string;
  description: string;
  private: boolean;
  templateOwner?: string;
  templateName?: string;
}

export interface GithubAdapter {
  readonly mode: "FAKE" | "GITHUB_APP" | "FINE_GRAINED_PAT";
  listOrganizations(): Promise<GithubOrganization[]>;
  listRepositories(owner: string): Promise<GithubRepositoryInfo[]>;
  getRepository(owner: string, name: string): Promise<GithubRepositoryInfo>;
  createRepository(input: CreateRepositoryInput): Promise<GithubRepositoryInfo>;
  createOrUpdateFile(
    owner: string,
    repository: string,
    path: string,
    content: string,
    message: string,
    branch: string,
  ): Promise<void>;
  createBranch(owner: string, repository: string, branch: string, fromSha: string): Promise<void>;
  getCommit(owner: string, repository: string, ref: string): Promise<{ sha: string }>;
  listPullRequests(owner: string, repository: string): Promise<GithubPullRequest[]>;
  createPullRequest(
    owner: string,
    repository: string,
    title: string,
    body: string,
    head: string,
    base: string,
  ): Promise<GithubPullRequest>;
  getChecks(owner: string, repository: string, ref: string): Promise<GithubCheckSummary[]>;
  cloneAuthorizationHeader(): Promise<string | undefined>;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function githubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${base64Url(signer.sign(privateKey))}`;
}

class GithubHttpAdapter implements GithubAdapter {
  readonly mode: "GITHUB_APP" | "FINE_GRAINED_PAT";
  private cachedToken: { value: string; expiresAt: number } | undefined;

  constructor(mode: "GITHUB_APP" | "FINE_GRAINED_PAT") {
    this.mode = mode;
  }

  private async token(): Promise<string> {
    if (this.mode === "FINE_GRAINED_PAT") {
      const token = process.env.GITHUB_FINE_GRAINED_PAT;
      if (!token) throw new Error("GITHUB_FINE_GRAINED_PAT가 설정되지 않았습니다.");
      return token;
    }
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }
    const appId = process.env.GITHUB_APP_ID;
    const installationId = process.env.GITHUB_INSTALLATION_ID;
    const encodedKey = process.env.GITHUB_PRIVATE_KEY_BASE64;
    if (!appId || !installationId || !encodedKey) {
      throw new Error("GitHub App 자격 증명이 완전하지 않습니다.");
    }
    const jwt = githubAppJwt(appId, Buffer.from(encodedKey, "base64").toString("utf8"));
    const response = await fetch(
      `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      {
        method: "POST",
        headers: this.headers(jwt),
      },
    );
    const body = (await response.json()) as {
      token?: string;
      expires_at?: string;
      message?: string;
    };
    if (!response.ok || !body.token || !body.expires_at) {
      throw new Error(`GitHub App token 발급 실패: ${body.message ?? response.status}`);
    }
    this.cachedToken = { value: body.token, expiresAt: new Date(body.expires_at).getTime() };
    return body.token;
  }

  private headers(token: string): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "sandeul-app-factory-v2",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(
      `${process.env.GITHUB_API_URL ?? "https://api.github.com"}${path}`,
      {
        ...init,
        headers: {
          ...this.headers(await this.token()),
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`GitHub API ${response.status}: ${detail}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async listOrganizations(): Promise<GithubOrganization[]> {
    if (this.mode === "FINE_GRAINED_PAT") {
      const organizations =
        await this.request<Array<{ login: string; avatar_url?: string }>>(
          "/user/orgs?per_page=100",
        );
      return organizations.map((organization) => ({
        login: organization.login,
        ...(organization.avatar_url ? { avatarUrl: organization.avatar_url } : {}),
      }));
    }
    const installation = await this.request<{
      repositories: Array<{ owner?: { login?: string; avatar_url?: string } }>;
    }>("/installation/repositories?per_page=100");
    const unique = new Map<string, GithubOrganization>();
    for (const repository of installation.repositories) {
      const login = repository.owner?.login;
      if (login && !unique.has(login)) {
        unique.set(login, {
          login,
          ...(repository.owner?.avatar_url ? { avatarUrl: repository.owner.avatar_url } : {}),
        });
      }
    }
    return [...unique.values()];
  }

  async listRepositories(owner: string): Promise<GithubRepositoryInfo[]> {
    const repositories = await this.request<Array<Record<string, unknown>>>(
      `/orgs/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`,
    ).catch(() =>
      this.request<Array<Record<string, unknown>>>(
        `/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`,
      ),
    );
    return repositories.map(mapRepository);
  }

  async getRepository(owner: string, name: string): Promise<GithubRepositoryInfo> {
    return mapRepository(
      await this.request<Record<string, unknown>>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      ),
    );
  }

  async createRepository(input: CreateRepositoryInput): Promise<GithubRepositoryInfo> {
    if (input.templateOwner && input.templateName) {
      return mapRepository(
        await this.request<Record<string, unknown>>(
          `/repos/${encodeURIComponent(input.templateOwner)}/${encodeURIComponent(input.templateName)}/generate`,
          {
            method: "POST",
            body: JSON.stringify({
              owner: input.owner,
              name: input.name,
              description: input.description,
              private: input.private,
              include_all_branches: false,
            }),
          },
        ),
      );
    }
    return mapRepository(
      await this.request<Record<string, unknown>>(
        `/orgs/${encodeURIComponent(input.owner)}/repos`,
        {
          method: "POST",
          body: JSON.stringify({
            name: input.name,
            description: input.description,
            private: input.private,
            auto_init: true,
          }),
        },
      ),
    );
  }

  async createOrUpdateFile(
    owner: string,
    repository: string,
    path: string,
    content: string,
    message: string,
    branch: string,
  ): Promise<void> {
    const encodedPath = path
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const existing: { sha?: string } = await this.request<{ sha?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    ).catch((): { sha?: string } => ({}));
    await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message,
          content: Buffer.from(content).toString("base64"),
          branch,
          ...(existing.sha ? { sha: existing.sha } : {}),
        }),
      },
    );
  }

  async createBranch(
    owner: string,
    repository: string,
    branch: string,
    fromSha: string,
  ): Promise<void> {
    await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/refs`,
      {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
      },
    );
  }

  async getCommit(owner: string, repository: string, ref: string): Promise<{ sha: string }> {
    const commit = await this.request<{ sha: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref)}`,
    );
    return { sha: commit.sha };
  }

  async listPullRequests(owner: string, repository: string): Promise<GithubPullRequest[]> {
    const pulls = await this.request<Array<Record<string, unknown>>>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls?state=all&per_page=50`,
    );
    return pulls.map(mapPullRequest);
  }

  async createPullRequest(
    owner: string,
    repository: string,
    title: string,
    body: string,
    head: string,
    base: string,
  ): Promise<GithubPullRequest> {
    return mapPullRequest(
      await this.request<Record<string, unknown>>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls`,
        { method: "POST", body: JSON.stringify({ title, body, head, base }) },
      ),
    );
  }

  async getChecks(owner: string, repository: string, ref: string): Promise<GithubCheckSummary[]> {
    const response = await this.request<{
      check_runs: Array<{
        status: string;
        conclusion: string | null;
        name: string;
        details_url: string | null;
      }>;
    }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref)}/check-runs`,
    );
    return response.check_runs.map((check) => ({
      status: check.status,
      conclusion: check.conclusion,
      name: check.name,
      detailsUrl: check.details_url,
    }));
  }

  async cloneAuthorizationHeader(): Promise<string> {
    return `Basic ${Buffer.from(`x-access-token:${await this.token()}`).toString("base64")}`;
  }
}

function mapRepository(repository: Record<string, unknown>): GithubRepositoryInfo {
  const owner = repository.owner as { login?: string } | undefined;
  return {
    id: String(repository.id),
    owner: owner?.login ?? "",
    name: stringValue(repository.name),
    htmlUrl: stringValue(repository.html_url),
    cloneUrl: stringValue(repository.clone_url),
    defaultBranch: stringValue(repository.default_branch, "main"),
    private: Boolean(repository.private),
  };
}

function mapPullRequest(pull: Record<string, unknown>): GithubPullRequest {
  const head = pull.head as { sha?: string } | undefined;
  return {
    number: Number(pull.number),
    title: stringValue(pull.title),
    state: stringValue(pull.state),
    htmlUrl: stringValue(pull.html_url),
    headSha: head?.sha ?? "",
  };
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export class FakeGithubAdapter implements GithubAdapter {
  readonly mode = "FAKE" as const;
  private repositories = new Map<string, GithubRepositoryInfo>();
  private pullRequests = new Map<string, GithubPullRequest[]>();

  constructor() {
    const configured = process.env.FAKE_GITHUB_OWNER ?? "sandeul";
    this.repositories.set(`${configured}/android-template`, {
      id: "1000",
      owner: configured,
      name: "android-template",
      htmlUrl: `https://github.com/${configured}/android-template`,
      cloneUrl: `https://github.com/${configured}/android-template.git`,
      defaultBranch: "main",
      private: true,
    });
  }

  listOrganizations(): Promise<GithubOrganization[]> {
    return Promise.resolve([{ login: process.env.FAKE_GITHUB_OWNER ?? "sandeul" }]);
  }

  listRepositories(owner: string): Promise<GithubRepositoryInfo[]> {
    return Promise.resolve([...this.repositories.values()].filter((repo) => repo.owner === owner));
  }

  getRepository(owner: string, name: string): Promise<GithubRepositoryInfo> {
    const repository = this.repositories.get(`${owner}/${name}`);
    if (!repository) return Promise.reject(new Error("Fake GitHub repository not found"));
    return Promise.resolve(repository);
  }

  createRepository(input: CreateRepositoryInput): Promise<GithubRepositoryInfo> {
    const repository: GithubRepositoryInfo = {
      id: `fake-${sha256(`${input.owner}/${input.name}`).slice(0, 24)}`,
      owner: input.owner,
      name: input.name,
      htmlUrl: `https://github.com/${input.owner}/${input.name}`,
      cloneUrl: `https://github.com/${input.owner}/${input.name}.git`,
      defaultBranch: "main",
      private: input.private,
    };
    this.repositories.set(`${input.owner}/${input.name}`, repository);
    return Promise.resolve(repository);
  }

  createOrUpdateFile(): Promise<void> {
    return Promise.resolve();
  }

  createBranch(): Promise<void> {
    return Promise.resolve();
  }

  getCommit(owner: string, repository: string, ref: string): Promise<{ sha: string }> {
    return Promise.resolve({ sha: sha256(`${owner}/${repository}/${ref}`).slice(0, 40) });
  }

  listPullRequests(owner: string, repository: string): Promise<GithubPullRequest[]> {
    return Promise.resolve(this.pullRequests.get(`${owner}/${repository}`) ?? []);
  }

  createPullRequest(
    owner: string,
    repository: string,
    title: string,
    _body: string,
    head: string,
    _base: string,
  ): Promise<GithubPullRequest> {
    const key = `${owner}/${repository}`;
    const pulls = this.pullRequests.get(key) ?? [];
    const pull: GithubPullRequest = {
      number: pulls.length + 1,
      title,
      state: "open",
      htmlUrl: `https://github.com/${key}/pull/${pulls.length + 1}`,
      headSha: sha256(head).slice(0, 40),
    };
    pulls.push(pull);
    this.pullRequests.set(key, pulls);
    return Promise.resolve(pull);
  }

  getChecks(): Promise<GithubCheckSummary[]> {
    return Promise.resolve([
      { name: "factory/fake-ci", status: "completed", conclusion: "success", detailsUrl: null },
    ]);
  }

  cloneAuthorizationHeader(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

export function createGithubAdapter(): GithubAdapter {
  const mode = (process.env.GITHUB_ADAPTER ?? "fake").toLowerCase();
  if (mode === "github-app") return new GithubHttpAdapter("GITHUB_APP");
  if (mode === "fine-grained-pat") return new GithubHttpAdapter("FINE_GRAINED_PAT");
  return new FakeGithubAdapter();
}

export function verifyGithubWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeEqual(signature, expected);
}

export async function androidRepositoryBootstrapFiles(): Promise<Record<string, string>> {
  const agents = await readFile(new URL("../templates/android/AGENTS.md", import.meta.url), "utf8");
  return {
    "AGENTS.md": agents,
    "README.md": "# Android App\n\nSandeul App Factory에서 관리하는 Android 앱입니다.\n",
    ".gitignore":
      ".gradle/\n.idea/\nlocal.properties\n*.jks\n*.keystore\n.env\n/build/\n**/build/\n",
    ".editorconfig":
      "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n",
    ".github/pull_request_template.md":
      "## 변경 요약\n\n## 잠긴 PRD / Task\n\n## 테스트\n\n## 보안 확인\n\n## 미완료 항목\n",
    ".github/ISSUE_TEMPLATE/feature.yml":
      'name: 기능 요청\ndescription: Factory 승인 범위의 기능 작업\ntitle: "[Feature] "\nbody:\n  - type: textarea\n    id: scope\n    attributes:\n      label: 승인 범위\n    validations:\n      required: true\n',
    "docs/factory/manifest.json":
      '{\n  "schemaVersion": 1,\n  "managedBy": "Sandeul App Factory v2"\n}\n',
    "docs/factory/prd/.gitkeep": "",
    "docs/factory/decisions/.gitkeep": "",
    "docs/factory/security/.gitkeep": "",
  };
}
