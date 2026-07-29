"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Modal, cn } from "@sandeul/ui";
import {
  Activity,
  Archive,
  Blocks,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Code2,
  FileCheck2,
  FileText,
  Files,
  FolderKanban,
  Gauge,
  GitBranch,
  GitPullRequest,
  History,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TestTube2,
  TerminalSquare,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { FormEvent, ReactNode } from "react";
import { apiRequest } from "../lib/api";
import type { AuthState } from "../lib/api";
import type {
  Artifact,
  DecisionRecord,
  DevelopmentTask,
  DevelopmentTaskDetail,
  FactoryBuild,
  FactoryRelease,
  PrdVersion,
  Project,
  SecurityScan,
  TestRun,
} from "../lib/types";

const primaryNav = [
  ["dashboard", "대시보드", Gauge],
  ["projects", "프로젝트", FolderKanban],
  ["approvals", "승인 대기", ClipboardCheck],
  ["tasks", "개발 작업", Code2],
  ["tests", "테스트", TestTube2],
  ["security", "보안검사", ShieldCheck],
  ["builds", "빌드", Boxes],
  ["files", "파일", Files],
  ["audit", "감사 로그", History],
  ["settings", "설정", Settings],
] as const;

const projectTabs = [
  "개요",
  "시장조사",
  "PRD",
  "CEO 제약사항",
  "의사결정 기록",
  "개발 작업",
  "코드 변경",
  "테스트",
  "보안",
  "빌드",
  "파일",
  "활동 기록",
] as const;

function formatSeoul(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (/LOCKED|APPROVED|PASSED|READY|SUCCEEDED|RELEASED/.test(status)) return "success";
  if (/FAILED|REJECTED|CRITICAL|HIGH|BLOCKED/.test(status)) return "danger";
  if (/REVIEW|QUEUED|DRAFT|REQUIRED|HOLD/.test(status)) return "warning";
  if (/DEVELOP|RUNNING|TESTING|SECURITY/.test(status)) return "info";
  return "neutral";
}

function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div
      className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
      role="alert"
    >
      {error instanceof Error ? error.message : "요청을 처리하지 못했습니다."}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="grid min-h-64 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-400">
          {icon}
        </div>
        <h3 className="mt-4 font-semibold text-white">{title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </Card>
  );
}

function CreateProjectModal({
  open,
  auth,
  onClose,
}: {
  open: boolean;
  auth: AuthState;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: { name: string; slug: string; summary: string }) =>
      apiRequest<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(payload),
        csrfToken: auth.csrfToken,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      title="새 프로젝트 만들기"
      description="아이디어를 PRD와 개발 작업이 연결되는 Factory 프로젝트로 등록합니다."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          mutation.mutate({
            name: formString(data, "name"),
            slug: formString(data, "slug"),
            summary: formString(data, "summary"),
          });
        }}
      >
        <label className="grid gap-2 text-sm">
          프로젝트 이름
          <input className="factory-input" name="name" required maxLength={120} />
        </label>
        <label className="grid gap-2 text-sm">
          식별자
          <input
            className="factory-input"
            name="slug"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="my-android-app"
          />
        </label>
        <label className="grid gap-2 text-sm">
          프로젝트 요약
          <textarea className="factory-input min-h-28 py-3" name="summary" maxLength={2000} />
        </label>
        <ErrorNotice error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button className="!bg-zinc-800 !text-zinc-200 hover:!bg-zinc-700" onClick={onClose}>
            취소
          </Button>
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? "생성 중…" : "프로젝트 생성"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Dashboard({
  projects,
  onCreate,
  onOpen,
}: {
  projects: Project[];
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const reviewing = projects.filter((project) =>
    /REVIEW|APPROVAL|LOCK/.test(project.status),
  ).length;
  const developing = projects.filter((project) =>
    /DEVELOP|QUEUED|CODE_REVIEW/.test(project.status),
  ).length;
  const release = projects.filter((project) =>
    /RELEASE|BUILT|SIGNED|FINAL/.test(project.status),
  ).length;
  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-300">CEO OVERVIEW</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">앱 제작 현황</h1>
          <p className="mt-2 text-sm text-zinc-500">
            승인, 개발, 테스트와 출시 위험을 한곳에서 관리합니다.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={16} aria-hidden="true" /> 새 프로젝트
        </Button>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["전체 프로젝트", projects.length, Building2, "text-zinc-200"],
            ["검토·승인", reviewing, ClipboardCheck, "text-amber-300"],
            ["개발 진행", developing, Code2, "text-sky-300"],
            ["출시 단계", release, CheckCircle2, "text-emerald-300"],
          ] as const
        ).map(([label, value, Icon, color]) => (
          <Card className="p-5" key={String(label)}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">{label}</span>
              <Icon className={color} size={18} aria-hidden="true" />
            </div>
            <p className="mt-5 text-3xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="font-semibold">최근 프로젝트</h2>
            <p className="mt-1 text-xs text-zinc-500">마지막 변경 순서</p>
          </div>
        </div>
        {projects.length ? (
          <div className="divide-y divide-zinc-800">
            {projects.slice(0, 8).map((project) => (
              <button
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-zinc-800/50 focus-visible:outline-2 focus-visible:outline-emerald-400"
                key={project.id}
                onClick={() => onOpen(project.id)}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300">
                  <FolderKanban size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-white">{project.name}</span>
                    <Badge tone={statusTone(project.status)}>{project.status}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {project.summary || project.slug}
                  </p>
                </div>
                <time className="hidden text-xs text-zinc-500 sm:block">
                  {formatSeoul(project.updatedAt)}
                </time>
                <ChevronRight size={17} className="text-zinc-600" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FolderKanban size={20} />}
            title="아직 프로젝트가 없습니다"
            description="첫 Android 앱 프로젝트를 만들고 ChatGPT에서 완성한 PRD를 업로드하세요."
            action={<Button onClick={onCreate}>첫 프로젝트 만들기</Button>}
          />
        )}
      </Card>
    </div>
  );
}

function UploadPrdModal({
  open,
  projectId,
  auth,
  onClose,
}: {
  open: boolean;
  projectId: string;
  auth: AuthState;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const criteria = formString(data, "criteria")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const excluded = formString(data, "excluded")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      data.delete("criteria");
      data.delete("excluded");
      data.set("acceptanceCriteria", JSON.stringify(criteria));
      data.set("excludedScope", JSON.stringify(excluded));
      data.set("includedArtifactIds", "[]");
      return apiRequest<PrdVersion>(`/projects/${projectId}/prds`, {
        method: "POST",
        body: data,
        csrfToken: auth.csrfToken,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prds", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      title="Canonical PRD 업로드"
      description=".md 또는 정의된 schema를 통과하는 .json만 Canonical PRD가 됩니다."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(event.currentTarget);
        }}
      >
        <label className="grid gap-2 text-sm">
          PRD 파일
          <input
            className="factory-input file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-200"
            name="file"
            type="file"
            accept=".md,.json,text/markdown,application/json"
            required
          />
        </label>
        <label className="grid gap-2 text-sm">
          Acceptance Criteria{" "}
          <span className="text-xs text-zinc-500">Markdown은 한 줄에 하나씩 필수</span>
          <textarea className="factory-input min-h-28 py-3" name="criteria" />
        </label>
        <label className="grid gap-2 text-sm">
          제외 범위 <span className="text-xs text-zinc-500">한 줄에 하나씩</span>
          <textarea className="factory-input min-h-20 py-3" name="excluded" />
        </label>
        <ErrorNotice error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button className="!bg-zinc-800 !text-zinc-200" onClick={onClose}>
            취소
          </Button>
          <Button disabled={mutation.isPending} type="submit">
            <Upload size={16} /> {mutation.isPending ? "검증·업로드 중…" : "새 버전 업로드"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ApprovalModal({
  open,
  prd,
  auth,
  onClose,
}: {
  open: boolean;
  prd: PrdVersion;
  auth: AuthState;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return apiRequest(`/prd-versions/${prd.id}/approvals`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({
          action: data.get("action"),
          title: data.get("title"),
          detail: data.get("detail"),
          scope: data.get("scope"),
          priority: data.get("priority"),
          mandatory: data.get("mandatory") === "on",
          reason: data.get("reason"),
        }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prds", prd.projectId] }),
        queryClient.invalidateQueries({ queryKey: ["prd", prd.id] }),
        queryClient.invalidateQueries({ queryKey: ["project", prd.projectId] }),
      ]);
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      title={`PRD v${prd.versionNumber} 승인 결정`}
      description="결정의 범위와 사유는 감사 로그와 승인 이력에 영구 기록됩니다."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(event.currentTarget);
        }}
      >
        <label className="grid gap-2 text-sm">
          액션
          <select className="factory-input" name="action" defaultValue="APPROVE">
            <option value="APPROVE">최종 승인</option>
            <option value="CONDITIONAL_APPROVE">조건부 승인</option>
            <option value="REQUEST_REVISION">수정 요청</option>
            <option value="REJECT">반려</option>
            <option value="HOLD">보류</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          제목
          <input className="factory-input" name="title" required />
        </label>
        <label className="grid gap-2 text-sm">
          상세 내용
          <textarea className="factory-input min-h-24 py-3" name="detail" required />
        </label>
        <label className="grid gap-2 text-sm">
          적용 범위
          <input className="factory-input" name="scope" defaultValue="전체 PRD" required />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            우선순위
            <select className="factory-input" name="priority" defaultValue="HIGH">
              <option>CRITICAL</option>
              <option>HIGH</option>
              <option>MEDIUM</option>
              <option>LOW</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-zinc-700 px-3 py-3 text-sm">
            <input type="checkbox" name="mandatory" defaultChecked /> 필수 결정
          </label>
        </div>
        <label className="grid gap-2 text-sm">
          사유
          <textarea className="factory-input min-h-20 py-3" name="reason" required />
        </label>
        <ErrorNotice error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button className="!bg-zinc-800 !text-zinc-200" onClick={onClose}>
            취소
          </Button>
          <Button disabled={mutation.isPending} type="submit">
            결정 기록
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PrdWorkspace({ project, auth }: { project: Project; auth: AuthState }) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const versions = useQuery({
    queryKey: ["prds", project.id],
    queryFn: () => apiRequest<PrdVersion[]>(`/projects/${project.id}/prds`),
  });
  const selected = selectedId ?? versions.data?.[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ["prd", selected],
    queryFn: () => apiRequest<PrdVersion>(`/prd-versions/${selected}`),
    enabled: Boolean(selected),
  });
  const action = useMutation({
    mutationFn: (kind: "review" | "lock") => {
      if (!detail.data) throw new Error("PRD가 선택되지 않았습니다.");
      return apiRequest(
        `/prd-versions/${detail.data.id}/${kind === "review" ? "request-review" : "lock"}`,
        { method: "POST", csrfToken: auth.csrfToken },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prds", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["prd", selected] }),
        queryClient.invalidateQueries({ queryKey: ["project", project.id] }),
      ]);
    },
  });
  const comment = useMutation({
    mutationFn: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!detail.data) throw new Error("PRD가 선택되지 않았습니다.");
      const form = event.currentTarget;
      const data = new FormData(form);
      return apiRequest(`/projects/${project.id}/prd-comments`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({
          prdVersionId: detail.data.id,
          sectionId: data.get("sectionId") || undefined,
          body: data.get("body"),
        }),
      }).then(() => form.reset());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prd", selected] }),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="h-fit">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <span className="text-sm font-semibold">PRD 버전</span>
          <button
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            onClick={() => setUploadOpen(true)}
            aria-label="새 PRD 버전 업로드"
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="p-2">
          {versions.data?.map((version) => (
            <button
              className={cn(
                "mb-1 w-full rounded-lg px-3 py-3 text-left transition",
                selected === version.id ? "bg-zinc-800" : "hover:bg-zinc-800/60",
              )}
              key={version.id}
              onClick={() => setSelectedId(version.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">v{version.versionNumber}</span>
                <Badge tone={statusTone(version.status)}>{version.status}</Badge>
              </div>
              <p className="mt-2 font-mono text-[11px] text-zinc-600">
                {version.sha256.slice(0, 12)}…
              </p>
            </button>
          ))}
          {!versions.isPending && !versions.data?.length ? (
            <p className="p-4 text-center text-sm text-zinc-500">업로드된 PRD가 없습니다.</p>
          ) : null}
        </div>
      </Card>
      <div className="min-w-0">
        {detail.data ? (
          <div className="grid gap-5">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="text-emerald-300" size={19} />
                    <h2 className="text-lg font-semibold">PRD v{detail.data.versionNumber}</h2>
                    <Badge tone={statusTone(detail.data.status)}>{detail.data.status}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-zinc-500">
                    SHA-256 {detail.data.sha256}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.data.status === "DRAFT" || detail.data.status === "REVISION_REQUIRED" ? (
                    <Button disabled={action.isPending} onClick={() => action.mutate("review")}>
                      검토 요청
                    </Button>
                  ) : null}
                  {detail.data.status === "IN_REVIEW" ? (
                    <Button onClick={() => setApprovalOpen(true)}>승인 결정</Button>
                  ) : null}
                  {detail.data.status === "APPROVED" ? (
                    <Button disabled={action.isPending} onClick={() => action.mutate("lock")}>
                      <LockKeyhole size={16} /> 최종 잠금
                    </Button>
                  ) : null}
                  <Button
                    className="!bg-zinc-800 !text-zinc-200"
                    onClick={() => setUploadOpen(true)}
                  >
                    새 버전
                  </Button>
                </div>
              </div>
              <ErrorNotice error={action.error} />
            </Card>
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-800 px-5 py-3 text-sm font-medium">
                Canonical 본문
              </div>
              <article className="prose-factory max-h-[640px] overflow-auto p-6">
                {detail.data.contentMarkdown ? (
                  <ReactMarkdown>{detail.data.contentMarkdown}</ReactMarkdown>
                ) : (
                  <pre>{JSON.stringify(detail.data.contentJson, null, 2)}</pre>
                )}
              </article>
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-semibold">Acceptance Criteria</h3>
                <ul className="mt-4 grid gap-3">
                  {detail.data.acceptanceCriteria.map((item, index) => (
                    <li className="flex gap-3 text-sm text-zinc-300" key={`${index}-${item}`}>
                      <ListChecks className="mt-0.5 shrink-0 text-emerald-400" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <h3 className="font-semibold">섹션 코멘트</h3>
                <div className="mt-4 max-h-48 space-y-3 overflow-auto">
                  {detail.data.comments?.map((item) => (
                    <div
                      className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm"
                      key={item.id}
                    >
                      <p>{item.body}</p>
                      <time className="mt-2 block text-xs text-zinc-600">
                        {formatSeoul(item.createdAt)}
                      </time>
                    </div>
                  ))}
                  {!detail.data.comments?.length ? (
                    <p className="text-sm text-zinc-500">아직 코멘트가 없습니다.</p>
                  ) : null}
                </div>
                <form
                  className="mt-4 grid gap-3 border-t border-zinc-800 pt-4"
                  onSubmit={(event) => comment.mutate(event)}
                >
                  <select className="factory-input" name="sectionId" aria-label="코멘트 섹션">
                    <option value="">PRD 전체</option>
                    {detail.data.sections?.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.heading}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="factory-input min-h-20 py-3"
                    name="body"
                    required
                    placeholder="검토 의견을 입력하세요."
                  />
                  <Button disabled={comment.isPending} type="submit">
                    코멘트 작성
                  </Button>
                </form>
              </Card>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={20} />}
            title="PRD를 업로드하세요"
            description="ChatGPT에서 완성한 Markdown 또는 구조화 JSON을 새 Canonical PRD로 등록합니다."
            action={
              <Button onClick={() => setUploadOpen(true)}>
                <Upload size={16} /> PRD 업로드
              </Button>
            }
          />
        )}
      </div>
      <UploadPrdModal
        open={uploadOpen}
        projectId={project.id}
        auth={auth}
        onClose={() => setUploadOpen(false)}
      />
      {detail.data ? (
        <ApprovalModal
          open={approvalOpen}
          prd={detail.data}
          auth={auth}
          onClose={() => setApprovalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DecisionPanel({
  projectId,
  auth,
  kind,
}: {
  projectId: string;
  auth: AuthState;
  kind: "constraints" | "decisions";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const records = useQuery({
    queryKey: [kind, projectId],
    queryFn: () => apiRequest<DecisionRecord[]>(`/projects/${projectId}/${kind}`),
  });
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return apiRequest(`/projects/${projectId}/${kind}`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({
          title: data.get("title"),
          detail: data.get("detail"),
          scope: data.get("scope"),
          priority: data.get("priority"),
          mandatory: data.get("mandatory") === "on",
          reason: data.get("reason"),
          ...(kind === "decisions" && data.get("action") ? { action: data.get("action") } : {}),
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [kind, projectId] });
      setOpen(false);
    },
  });
  const title = kind === "constraints" ? "CEO 제약사항" : "의사결정 기록";
  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            기존 내용을 덮어쓰지 않고 버전으로 보존합니다.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> 새 기록
        </Button>
      </div>
      {records.data?.length ? (
        <div className="grid gap-4">
          {records.data.map((record) => (
            <Card className="p-5" key={record.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{record.title}</h3>
                    <Badge tone={record.mandatory ? "warning" : "neutral"}>
                      {record.mandatory ? "필수" : "권고"}
                    </Badge>
                    <Badge tone={statusTone(record.priority)}>{record.priority}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{record.detail}</p>
                </div>
                <span className="text-xs text-zinc-600">v{record.versionNumber}</span>
              </div>
              <div className="mt-4 grid gap-2 border-t border-zinc-800 pt-4 text-xs text-zinc-500 sm:grid-cols-3">
                <span>범위 · {record.scope}</span>
                <span>사유 · {record.reason}</span>
                <span>{formatSeoul(record.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={kind === "constraints" ? <LockKeyhole size={20} /> : <FileCheck2 size={20} />}
          title={`등록된 ${title}이 없습니다`}
          description="개발 조직이 잠긴 PRD와 함께 반드시 따라야 할 판단 근거를 기록하세요."
          action={<Button onClick={() => setOpen(true)}>첫 기록 작성</Button>}
        />
      )}
      <Modal
        open={open}
        title={`새 ${title}`}
        description="적용 범위, 우선순위와 사유를 구체적으로 기록합니다."
        onClose={() => setOpen(false)}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          {kind === "decisions" ? (
            <label className="grid gap-2 text-sm">
              의사결정 액션
              <select className="factory-input" name="action" defaultValue="">
                <option value="">일반 Decision Record</option>
                <option value="ADD_FEATURE">기능 추가</option>
                <option value="EXCLUDE_FEATURE">기능 제외</option>
                <option value="CHANGE_PRIORITY">우선순위 변경</option>
                <option value="CHANGE_TARGET_USER">타깃 사용자 변경</option>
                <option value="CHANGE_REVENUE_MODEL">수익모델 변경</option>
                <option value="ADD_TECHNICAL_CONSTRAINT">기술 제약 추가</option>
                <option value="ADD_SECURITY_CONSTRAINT">보안 제약 추가</option>
                <option value="CHANGE_RELEASE_SCOPE">출시 범위 변경</option>
              </select>
            </label>
          ) : null}
          <label className="grid gap-2 text-sm">
            제목
            <input className="factory-input" name="title" required />
          </label>
          <label className="grid gap-2 text-sm">
            상세 내용
            <textarea className="factory-input min-h-28 py-3" name="detail" required />
          </label>
          <label className="grid gap-2 text-sm">
            적용 범위
            <input className="factory-input" name="scope" required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              우선순위
              <select className="factory-input" name="priority" defaultValue="MEDIUM">
                <option>CRITICAL</option>
                <option>HIGH</option>
                <option>MEDIUM</option>
                <option>LOW</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-lg border border-zinc-700 px-3 py-3 text-sm">
              <input type="checkbox" name="mandatory" defaultChecked /> 필수 적용
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            사유
            <textarea className="factory-input min-h-20 py-3" name="reason" required />
          </label>
          <ErrorNotice error={mutation.error} />
          <div className="flex justify-end gap-2">
            <Button className="!bg-zinc-800 !text-zinc-200" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              기록 저장
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function FilesPanel({ projectId, auth }: { projectId: string; auth: AuthState }) {
  const artifacts = useQuery({
    queryKey: ["artifacts", projectId],
    queryFn: () => apiRequest<Artifact[]>(`/projects/${projectId}/artifacts`),
  });
  const download = useMutation({
    mutationFn: (versionId: string) =>
      apiRequest<{ url: string }>(`/artifact-versions/${versionId}/download`),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const grouped = useMemo(
    () =>
      Object.entries(
        (artifacts.data ?? []).reduce<Record<string, Artifact[]>>((accumulator, artifact) => {
          (accumulator[artifact.logicalFolder] ??= []).push(artifact);
          return accumulator;
        }, {}),
      ),
    [artifacts.data],
  );
  void auth;
  return grouped.length ? (
    <div className="grid gap-5">
      {grouped.map(([folder, files]) => (
        <Card key={folder}>
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4 font-medium">
            <Archive size={17} className="text-amber-300" /> {folder}
          </div>
          <div className="divide-y divide-zinc-800">
            {files.map((artifact) => {
              const version = artifact.versions[0];
              return (
                <div className="flex items-center gap-4 px-5 py-4" key={artifact.id}>
                  <FileText size={18} className="shrink-0 text-zinc-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{artifact.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-600">{version?.sha256}</p>
                  </div>
                  <Badge>{artifact.kind}</Badge>
                  {version ? (
                    <Button
                      className="!min-h-8 !bg-zinc-800 !px-3 !py-1 !text-xs !text-zinc-200"
                      disabled={download.isPending}
                      onClick={() => download.mutate(version.id)}
                    >
                      다운로드
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  ) : (
    <EmptyState
      icon={<Files size={20} />}
      title="저장된 파일이 없습니다"
      description="PRD와 조사 자료, 보고서, 빌드가 프로젝트·버전 기준 Object Storage에 보관됩니다."
    />
  );
}

function ActivityPanel({ projectId }: { projectId: string }) {
  const history = useQuery({
    queryKey: ["project-history", projectId],
    queryFn: () =>
      apiRequest<
        Array<{
          id: string;
          previousStatus: string;
          newStatus: string;
          reason: string;
          createdAt: string;
        }>
      >(`/projects/${projectId}/history`),
  });
  return (
    <Card className="p-5">
      <h2 className="font-semibold">상태 전환 기록</h2>
      <div className="mt-5 grid gap-5 border-l border-zinc-800 pl-5">
        {history.data?.map((item) => (
          <div className="relative" key={item.id}>
            <span className="absolute -left-[25px] top-1 size-2 rounded-full bg-emerald-400" />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{item.previousStatus}</Badge>
              <span>→</span>
              <Badge tone={statusTone(item.newStatus)}>{item.newStatus}</Badge>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{item.reason}</p>
            <time className="mt-1 block text-xs text-zinc-600">{formatSeoul(item.createdAt)}</time>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface RepositoryDetail {
  id: string;
  owner: string;
  name: string;
  htmlUrl: string;
  defaultBranch: string;
  authMode: string;
  lastSyncedAt?: string | null;
  pullRequests: Array<{
    number: number;
    title: string;
    state: string;
    htmlUrl: string;
    headSha: string;
  }>;
  checks: Array<{
    name: string;
    status: string;
    conclusion?: string | null;
    detailsUrl?: string | null;
  }>;
}

function RepositoryPanel({ project, auth }: { project: Project; auth: AuthState }) {
  const queryClient = useQueryClient();
  const [owner, setOwner] = useState("");
  const repository = useQuery({
    queryKey: ["repository", project.id],
    queryFn: () => apiRequest<RepositoryDetail>(`/projects/${project.id}/repository`),
    enabled: Boolean(project.repository),
  });
  const remote = useQuery({
    queryKey: ["github-repositories", owner],
    queryFn: () =>
      apiRequest<
        Array<{
          id: string;
          owner: string;
          name: string;
          htmlUrl: string;
          defaultBranch: string;
          private: boolean;
        }>
      >(`/github/repositories?owner=${encodeURIComponent(owner)}`),
    enabled: /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner),
  });
  const create = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return apiRequest(`/projects/${project.id}/repository/create`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({
          owner: formString(data, "owner"),
          name: formString(data, "name"),
          description: formString(data, "description"),
          private: data.get("private") === "on",
          templateOwner: formString(data, "templateOwner") || undefined,
          templateName: formString(data, "templateName") || undefined,
        }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["repository", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
    },
  });
  const connect = useMutation({
    mutationFn: (selected: NonNullable<typeof remote.data>[number]) =>
      apiRequest(`/projects/${project.id}/repository/connect`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({
          owner: selected.owner,
          name: selected.name,
          defaultBranch: selected.defaultBranch,
          htmlUrl: selected.htmlUrl,
          externalId: selected.id,
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["repository", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
    },
  });

  if (project.repository) {
    const data = repository.data;
    return (
      <div className="grid gap-5">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch size={18} className="text-emerald-300" />
                <h2 className="font-semibold">
                  {project.repository.owner}/{project.repository.name}
                </h2>
              </div>
              <a
                className="mt-2 block text-sm text-zinc-500 hover:text-emerald-300"
                href={project.repository.htmlUrl}
                rel="noreferrer"
                target="_blank"
              >
                {project.repository.htmlUrl}
              </a>
            </div>
            <div className="flex gap-2">
              <Badge tone="success">연결됨</Badge>
              <Badge>{data?.authMode ?? "동기화 중"}</Badge>
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 text-sm sm:grid-cols-3">
            <div>
              <span className="block text-xs text-zinc-600">기본 Branch</span>
              <code className="mt-2 block text-zinc-300">
                {data?.defaultBranch ?? project.repository.defaultBranch}
              </code>
            </div>
            <div>
              <span className="block text-xs text-zinc-600">Pull Requests</span>
              <span className="mt-2 block text-zinc-300">{data?.pullRequests.length ?? 0}</span>
            </div>
            <div>
              <span className="block text-xs text-zinc-600">마지막 동기화</span>
              <span className="mt-2 block text-zinc-300">
                {data?.lastSyncedAt ? formatSeoul(data.lastSyncedAt) : "확인 중"}
              </span>
            </div>
          </div>
        </Card>
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-semibold">Pull Requests</h3>
            <div className="mt-4 grid gap-3">
              {data?.pullRequests.length ? (
                data.pullRequests.map((pull) => (
                  <a
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 p-3 hover:border-zinc-700"
                    href={pull.htmlUrl}
                    key={pull.number}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <GitPullRequest size={17} className="text-emerald-300" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      #{pull.number} {pull.title}
                    </span>
                    <Badge tone={pull.state === "open" ? "info" : "neutral"}>{pull.state}</Badge>
                  </a>
                ))
              ) : (
                <p className="text-sm text-zinc-500">Pull Request가 없습니다.</p>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold">CI Checks</h3>
            <div className="mt-4 grid gap-3">
              {data?.checks.length ? (
                data.checks.map((check) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-zinc-800 p-3"
                    key={check.name}
                  >
                    <span className="text-sm">{check.name}</span>
                    <Badge tone={check.conclusion === "success" ? "success" : "warning"}>
                      {check.conclusion ?? check.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">CI Check 결과가 없습니다.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (project.status !== "PRD_LOCKED") {
    return (
      <EmptyState
        icon={<GitBranch size={20} />}
        title="Repository 연결 전"
        description="최종 승인된 PRD를 잠근 뒤 기존 Repository를 연결하거나 새 Repository를 만들 수 있습니다."
      />
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-semibold">새 Repository 생성</h2>
        <p className="mt-2 text-sm text-zinc-500">
          GitHub App 또는 Fine-grained PAT의 승인 범위 안에서 생성하고 Factory 기준 파일을
          초기화합니다.
        </p>
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(event.currentTarget);
          }}
        >
          <label className="grid gap-2 text-sm">
            Owner
            <input className="factory-input" name="owner" required />
          </label>
          <label className="grid gap-2 text-sm">
            Repository 이름
            <input className="factory-input" name="name" required />
          </label>
          <label className="grid gap-2 text-sm">
            설명
            <textarea className="factory-input min-h-20" name="description" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Template owner
              <input className="factory-input" name="templateOwner" />
            </label>
            <label className="grid gap-2 text-sm">
              Template repository
              <input className="factory-input" name="templateName" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input defaultChecked name="private" type="checkbox" /> Private Repository
          </label>
          <ErrorNotice error={create.error} />
          <Button disabled={create.isPending} type="submit">
            {create.isPending ? "생성 및 초기화 중…" : "Repository 생성 요청"}
          </Button>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">기존 Repository 연결</h2>
        <p className="mt-2 text-sm text-zinc-500">
          설치된 GitHub App 또는 PAT가 조회할 수 있는 Repository만 연결할 수 있습니다.
        </p>
        <label className="mt-5 grid gap-2 text-sm">
          Owner 조회
          <input
            className="factory-input"
            onChange={(event) => setOwner(event.target.value.trim())}
            placeholder="sandeul"
            value={owner}
          />
        </label>
        <ErrorNotice error={remote.error ?? connect.error} />
        <div className="mt-4 grid max-h-96 gap-2 overflow-y-auto">
          {remote.isFetching ? (
            <p className="text-sm text-zinc-500">Repository 조회 중…</p>
          ) : (
            remote.data?.map((item) => (
              <div
                className="flex items-center gap-3 rounded-lg border border-zinc-800 p-3"
                key={item.id}
              >
                <GitBranch size={16} className="text-zinc-500" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.owner}/{item.name}
                </span>
                <Button
                  className="!min-h-8 !px-3 !py-1 !text-xs"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate(item)}
                >
                  연결
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function TaskDetailPanel({ taskId, auth }: { taskId: string; auth: AuthState }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => apiRequest<DevelopmentTaskDetail>(`/tasks/${taskId}`),
    refetchInterval: 3_000,
  });
  const latestRun = detail.data?.runs[0];
  useEffect(() => {
    if (!latestRun || !["QUEUED", "STARTING", "RUNNING", "CANCELLING"].includes(latestRun.status)) {
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    const source = new EventSource(`${base}/codex-runs/${latestRun.id}/events`);
    source.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    };
    return () => source.close();
  }, [latestRun, queryClient, taskId]);
  const cancel = useMutation({
    mutationFn: () =>
      apiRequest(`/tasks/${taskId}/cancel`, {
        method: "POST",
        csrfToken: auth.csrfToken,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
  });
  const followUp = useMutation({
    mutationFn: (instruction: string) =>
      apiRequest(`/tasks/${taskId}/instructions`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({ instruction }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
    },
  });
  if (detail.isPending) return <p className="text-sm text-zinc-500">작업 상세를 불러오는 중…</p>;
  if (detail.error || !detail.data) return <ErrorNotice error={detail.error} />;
  const data = detail.data;
  const runEvents = latestRun
    ? data.events.filter((event) => event.codexRunId === latestRun.id)
    : [];
  const active = ["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(data.status);
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge>{data.type}</Badge>
              <Badge tone={statusTone(data.status)}>{data.status}</Badge>
            </div>
            <h3 className="mt-3 text-lg font-semibold">{data.title}</h3>
            <p className="mt-2 font-mono text-xs text-zinc-600">
              Locked PRD {data.lockedPrdSha256}
            </p>
          </div>
          {active ? (
            <Button
              className="!bg-red-950 !text-red-200 hover:!bg-red-900"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              작업 중단
            </Button>
          ) : null}
        </div>
        <ErrorNotice error={cancel.error} />
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="font-semibold">실행 로그</h3>
            <p className="mt-1 text-xs text-zinc-500">SSE 실시간 이벤트 · JSONL 수집</p>
          </div>
          <div className="flex items-center gap-2">
            {active ? <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> : null}
            <Badge tone={statusTone(latestRun?.status ?? data.status)}>
              {latestRun?.status ?? data.status}
            </Badge>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-6">
          {runEvents.length ? (
            runEvents.map((event) => (
              <div className="grid grid-cols-[42px_1fr] gap-3" key={event.id}>
                <span className="text-zinc-700">{String(event.sequence).padStart(3, "0")}</span>
                <span className={event.level === "ERROR" ? "text-red-300" : "text-zinc-400"}>
                  <span className="text-emerald-700">[{event.eventType}]</span> {event.message}
                </span>
              </div>
            ))
          ) : (
            <span className="text-zinc-600">Worker 이벤트를 기다리는 중입니다.</span>
          )}
        </div>
      </Card>
      {latestRun?.finalMessage || latestRun?.errorMessage ? (
        <Card className="p-5">
          <h3 className="font-semibold">완료 보고</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-400">
            {latestRun.finalMessage ?? latestRun.errorMessage}
          </p>
          {latestRun.pullRequestUrl ? (
            <a
              className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200"
              href={latestRun.pullRequestUrl}
              rel="noreferrer"
              target="_blank"
            >
              <GitPullRequest size={16} /> Pull Request #{latestRun.pullRequestNumber} 열기
            </a>
          ) : null}
        </Card>
      ) : null}
      {!active ? (
        <Card className="p-5">
          <h3 className="font-semibold">후속 지시 / 재작업 요청</h3>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const instruction = formString(new FormData(event.currentTarget), "instruction");
              followUp.mutate(instruction);
            }}
          >
            <textarea
              className="factory-input min-h-28"
              name="instruction"
              placeholder="기존 지시를 덮어쓰지 않고 새 TaskInstructionVersion으로 저장됩니다."
              required
            />
            <ErrorNotice error={followUp.error} />
            <Button disabled={followUp.isPending} type="submit">
              후속 지시 등록
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function TasksPanel({ project, auth }: { project: Project; auth: AuthState }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const tasks = useQuery({
    queryKey: ["tasks", project.id],
    queryFn: () => apiRequest<DevelopmentTask[]>(`/projects/${project.id}/tasks`),
    refetchInterval: 4_000,
  });
  useEffect(() => {
    if (!selected && tasks.data?.[0]) setSelected(tasks.data[0].id);
  }, [selected, tasks.data]);
  const create = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const lines = (name: string) =>
        formString(data, name)
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      return apiRequest<DevelopmentTaskDetail>(`/projects/${project.id}/tasks`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({
          type: formString(data, "type"),
          title: formString(data, "title"),
          instruction: formString(data, "instruction"),
          acceptanceCriteria: lines("acceptanceCriteria"),
          targetRepositoryId: project.repository?.id,
          targetBranch: formString(data, "targetBranch"),
          allowedPaths: lines("allowedPaths"),
          deniedPaths: lines("deniedPaths"),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
    },
    onSuccess: async (task) => {
      setSelected(task.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["project", project.id] }),
      ]);
    },
  });
  const canCreate =
    Boolean(project.repository) &&
    [
      "REPO_READY",
      "CODE_REVIEW",
      "QA_TESTING",
      "SECURITY_REVIEW",
      "RELEASE_CANDIDATE",
      "FINAL_APPROVAL",
      "BUILT",
    ].includes(project.status);
  return (
    <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
      <div className="grid content-start gap-5">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="font-semibold">개발 작업</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {tasks.data?.map((task) => (
              <button
                className={cn(
                  "w-full p-4 text-left transition",
                  selected === task.id ? "bg-zinc-800/70" : "hover:bg-zinc-800/30",
                )}
                key={task.id}
                onClick={() => setSelected(task.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge>{task.type}</Badge>
                  <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                </div>
                <p className="mt-3 truncate text-sm font-medium">{task.title}</p>
                <time className="mt-2 block text-xs text-zinc-600">
                  {formatSeoul(task.createdAt)}
                </time>
              </button>
            ))}
            {!tasks.data?.length ? (
              <p className="p-5 text-sm text-zinc-500">등록된 작업이 없습니다.</p>
            ) : null}
          </div>
        </Card>
        {canCreate ? (
          <Card className="p-4">
            <h3 className="font-semibold">새 Codex 작업</h3>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate(event.currentTarget);
              }}
            >
              <select className="factory-input" defaultValue="IMPLEMENT_PRD" name="type">
                <option value="IMPLEMENT_PRD">PRD 구현</option>
                <option value="IMPLEMENT_FEATURE">기능 추가</option>
                <option value="FIX_REVIEW">리뷰 수정</option>
                <option value="FIX_TEST">테스트 수정</option>
                <option value="FIX_SECURITY">보안 수정</option>
                <option value="REFACTOR_APPROVED_SCOPE">승인 범위 Refactor</option>
                <option value="BUILD_RELEASE_CANDIDATE">Release Candidate 빌드</option>
                <option value="GENERATE_DOCUMENTATION">문서 생성</option>
              </select>
              <input className="factory-input" name="title" placeholder="작업 제목" required />
              <textarea
                className="factory-input min-h-24"
                name="instruction"
                placeholder="개발 지시"
                required
              />
              <textarea
                className="factory-input min-h-20"
                name="acceptanceCriteria"
                placeholder={"Acceptance Criteria — 한 줄에 하나\n로그인 성공"}
                required
              />
              <input
                className="factory-input"
                defaultValue={project.repository?.defaultBranch ?? "main"}
                name="targetBranch"
                placeholder="대상 Branch"
                required
              />
              <textarea
                className="factory-input min-h-16"
                name="allowedPaths"
                placeholder={"허용 경로 — 선택\napp/**"}
              />
              <textarea
                className="factory-input min-h-16"
                name="deniedPaths"
                placeholder={"금지 경로 — 선택\ninfra/**"}
              />
              <ErrorNotice error={create.error} />
              <Button disabled={create.isPending} type="submit">
                {create.isPending ? "대기열 등록 중…" : "Codex 작업 생성"}
              </Button>
            </form>
          </Card>
        ) : null}
      </div>
      {selected ? (
        <TaskDetailPanel auth={auth} taskId={selected} />
      ) : (
        <EmptyState
          icon={<TerminalSquare size={20} />}
          title="개발 작업을 선택하세요"
          description="잠긴 PRD와 Repository가 준비되면 승인 범위의 Codex 작업을 생성할 수 있습니다."
        />
      )}
    </div>
  );
}

function CodeChangesPanel({ projectId }: { projectId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const tasks = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => apiRequest<DevelopmentTask[]>(`/projects/${projectId}/tasks`),
  });
  useEffect(() => {
    if (!selected && tasks.data?.[0]) setSelected(tasks.data[0].id);
  }, [selected, tasks.data]);
  const detail = useQuery({
    queryKey: ["task", selected],
    queryFn: () => apiRequest<DevelopmentTaskDetail>(`/tasks/${selected}`),
    enabled: Boolean(selected),
  });
  const run = detail.data?.runs.find((item) => item.gitDiff);
  return (
    <div className="grid gap-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <GitPullRequest size={18} className="text-emerald-300" />
          <select
            className="factory-input max-w-md"
            onChange={(event) => setSelected(event.target.value)}
            value={selected ?? ""}
          >
            {!selected ? <option value="">작업 선택</option> : null}
            {tasks.data?.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title} · {task.status}
              </option>
            ))}
          </select>
          {run?.pullRequestUrl ? (
            <a
              className="text-sm text-emerald-300 hover:text-emerald-200"
              href={run.pullRequestUrl}
              rel="noreferrer"
              target="_blank"
            >
              PR #{run.pullRequestNumber} 열기
            </a>
          ) : null}
          {run?.commitSha ? <code className="text-xs text-zinc-600">{run.commitSha}</code> : null}
        </div>
      </Card>
      {run?.gitDiff ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <h2 className="font-semibold">Git diff</h2>
            <Badge tone="info">검토 전</Badge>
          </div>
          <pre className="max-h-[680px] overflow-auto bg-zinc-950 p-5 text-xs leading-6 text-zinc-400">
            {run.gitDiff}
          </pre>
        </Card>
      ) : (
        <EmptyState
          icon={<RefreshCw size={20} />}
          title="수집된 Git diff가 없습니다"
          description="Codex 작업이 완료되면 Worker가 변경 경로를 검증하고 diff, Commit SHA, Pull Request를 저장합니다."
        />
      )}
    </div>
  );
}

function TestRunsPanel({ projectId }: { projectId: string }) {
  const tests = useQuery({
    queryKey: ["test-runs", projectId],
    queryFn: () => apiRequest<TestRun[]>(`/projects/${projectId}/test-runs`),
  });
  if (tests.error) return <ErrorNotice error={tests.error} />;
  if (!tests.data?.length) {
    return (
      <EmptyState
        icon={<TestTube2 size={20} />}
        title="테스트 실행 기록이 없습니다"
        description="Codex Worker 또는 승인된 CI Adapter가 구조화된 Test Run을 제출하면 결과가 표시됩니다."
      />
    );
  }
  return (
    <div className="grid gap-4">
      {tests.data.map((run) => (
        <Card className="overflow-hidden" key={run.id}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 p-5">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                <span className="text-sm font-medium">{run.command}</span>
              </div>
              <p className="mt-2 font-mono text-xs text-zinc-600">{run.commitSha}</p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <p>{formatSeoul(run.createdAt)}</p>
              <p className="mt-1">
                Acceptance Criteria: {run.summary?.acceptanceCriteriaMet ? "충족" : "미확인"}
              </p>
            </div>
          </div>
          {run.summary?.note ? (
            <p className="border-b border-zinc-800 bg-amber-950/20 px-5 py-3 text-xs text-amber-300">
              {run.summary.note}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs text-zinc-600">
                <tr>
                  <th className="px-5 py-3">Suite</th>
                  <th className="px-5 py-3">테스트</th>
                  <th className="px-5 py-3">결과</th>
                  <th className="px-5 py-3">메시지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {run.results.map((result) => (
                  <tr key={result.id}>
                    <td className="px-5 py-3 text-zinc-500">{result.suite}</td>
                    <td className="px-5 py-3">{result.name}</td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(result.status)}>{result.status}</Badge>
                    </td>
                    <td className="max-w-md px-5 py-3 text-zinc-500">{result.message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SecurityScansPanel({ projectId, auth }: { projectId: string; auth: AuthState }) {
  const queryClient = useQueryClient();
  const scans = useQuery({
    queryKey: ["security-scans", projectId],
    queryFn: () => apiRequest<SecurityScan[]>(`/projects/${projectId}/security-scans`),
  });
  const accept = useMutation({
    mutationFn: (payload: { securityFindingId: string; reason: string; expiresAt?: string }) =>
      apiRequest(`/projects/${projectId}/risk-acceptances`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["security-scans", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
      ]);
    },
  });
  if (scans.error) return <ErrorNotice error={scans.error} />;
  if (!scans.data?.length) {
    return (
      <EmptyState
        icon={<ShieldCheck size={20} />}
        title="보안검사 기록이 없습니다"
        description="승인된 Scanner Adapter가 Finding과 SBOM 참조를 제출하면 Release Gate에서 검증합니다."
      />
    );
  }
  return (
    <div className="grid gap-4">
      <ErrorNotice error={accept.error} />
      {scans.data.map((scan) => (
        <Card className="p-5" key={scan.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(scan.status)}>{scan.status}</Badge>
              <h3 className="font-medium">{scan.scanner}</h3>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <p>{formatSeoul(scan.createdAt)}</p>
              <p className="mt-1 font-mono">{scan.commitSha.slice(0, 12)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            SBOM: {scan.sbomArtifactId ? "연결됨" : "없음 · Release 차단"}
          </p>
          <div className="mt-4 grid gap-3">
            {scan.findings.length ? (
              scan.findings.map((finding) => (
                <div
                  className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4"
                  key={finding.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(finding.severity)}>{finding.severity}</Badge>
                    <Badge tone={statusTone(finding.status)}>{finding.status}</Badge>
                    <span className="font-medium">{finding.title}</span>
                    <span className="ml-auto font-mono text-xs text-zinc-600">
                      {finding.ruleId}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{finding.description}</p>
                  {finding.filePath ? (
                    <p className="mt-2 font-mono text-xs text-zinc-600">
                      {finding.filePath}
                      {finding.line ? `:${finding.line}` : ""}
                    </p>
                  ) : null}
                  {finding.remediation ? (
                    <p className="mt-3 text-xs text-emerald-300">수정: {finding.remediation}</p>
                  ) : null}
                  {finding.riskAcceptance ? (
                    <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
                      위험 수용 사유: {finding.riskAcceptance.reason}
                    </div>
                  ) : finding.status === "OPEN" && finding.severity !== "CRITICAL" ? (
                    <form
                      className="mt-4 grid gap-2 border-t border-zinc-800 pt-4 sm:grid-cols-[1fr_180px_auto]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const expiresAt = formString(data, "expiresAt");
                        accept.mutate({
                          securityFindingId: finding.id,
                          reason: formString(data, "reason"),
                          ...(expiresAt
                            ? { expiresAt: new Date(`${expiresAt}T23:59:59+09:00`).toISOString() }
                            : {}),
                        });
                      }}
                    >
                      <input
                        className="factory-input"
                        name="reason"
                        required
                        minLength={10}
                        placeholder="위험 수용 사유 (필수)"
                      />
                      <input
                        aria-label="위험 수용 만료일"
                        className="factory-input"
                        name="expiresAt"
                        type="date"
                      />
                      <Button disabled={accept.isPending} type="submit">
                        위험 수용
                      </Button>
                    </form>
                  ) : finding.severity === "CRITICAL" ? (
                    <p className="mt-3 text-xs font-medium text-red-300">
                      CRITICAL은 위험 수용할 수 없으며 반드시 수정해야 합니다.
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm text-emerald-300">
                보고된 Finding이 없습니다.
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function BuildsPanel({ projectId, auth }: { projectId: string; auth: AuthState }) {
  const queryClient = useQueryClient();
  const [approvalReasons, setApprovalReasons] = useState<Record<string, string>>({});
  const [signingMessage, setSigningMessage] = useState<string | null>(null);
  const builds = useQuery({
    queryKey: ["builds", projectId],
    queryFn: () => apiRequest<FactoryBuild[]>(`/projects/${projectId}/builds`),
  });
  const tests = useQuery({
    queryKey: ["test-runs", projectId],
    queryFn: () => apiRequest<TestRun[]>(`/projects/${projectId}/test-runs`),
  });
  const scans = useQuery({
    queryKey: ["security-scans", projectId],
    queryFn: () => apiRequest<SecurityScan[]>(`/projects/${projectId}/security-scans`),
  });
  const releases = useQuery({
    queryKey: ["releases", projectId],
    queryFn: () => apiRequest<FactoryRelease[]>(`/projects/${projectId}/releases`),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["releases", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
    ]);
  };
  const createRelease = useMutation({
    mutationFn: (payload: { buildId: string; testRunId: string; securityScanId: string }) =>
      apiRequest<FactoryRelease>(`/projects/${projectId}/releases`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify(payload),
      }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (payload: { releaseId: string; reason: string }) =>
      apiRequest<FactoryRelease>(`/releases/${payload.releaseId}/approve`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({ reason: payload.reason }),
      }),
    onSuccess: refresh,
  });
  const sign = useMutation({
    mutationFn: (releaseId: string) =>
      apiRequest<{ message: string }>(`/releases/${releaseId}/sign`, {
        method: "POST",
        csrfToken: auth.csrfToken,
      }),
    onSuccess: (result) => setSigningMessage(result.message),
  });
  const download = useMutation({
    mutationFn: (artifactVersionId: string) =>
      apiRequest<{ url: string }>(`/artifact-versions/${artifactVersionId}/download`, {
        csrfToken: auth.csrfToken,
      }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const error =
    builds.error ||
    tests.error ||
    scans.error ||
    releases.error ||
    createRelease.error ||
    approve.error ||
    sign.error ||
    download.error;
  return (
    <div className="grid gap-5">
      <ErrorNotice error={error} />
      {signingMessage ? (
        <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
          {signingMessage}
        </div>
      ) : null}
      <Card className="p-5">
        <h3 className="font-semibold">Release Candidate 생성</h3>
        <p className="mt-2 text-sm text-zinc-500">
          선택한 세 기록의 Commit, 잠긴 PRD Hash, 테스트, Finding, SBOM, 빌드 Artifact를 서버가 다시
          검증합니다.
        </p>
        <form
          className="mt-4 grid gap-3 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            createRelease.mutate({
              buildId: formString(data, "buildId"),
              testRunId: formString(data, "testRunId"),
              securityScanId: formString(data, "securityScanId"),
            });
          }}
        >
          <label className="grid gap-2 text-xs text-zinc-500">
            빌드
            <select className="factory-input" name="buildId" required>
              <option value="">선택</option>
              {builds.data?.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.buildType} · {build.status} · {build.commitSha.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs text-zinc-500">
            Test Run
            <select className="factory-input" name="testRunId" required>
              <option value="">선택</option>
              {tests.data?.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.status} · {run.commitSha.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs text-zinc-500">
            Security Scan
            <select className="factory-input" name="securityScanId" required>
              <option value="">선택</option>
              {scans.data?.map((scan) => (
                <option key={scan.id} value={scan.id}>
                  {scan.scanner} · {scan.status} · {scan.commitSha.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <div className="lg:col-span-3">
            <Button disabled={createRelease.isPending} type="submit">
              Release Gate 실행 및 Candidate 생성
            </Button>
          </div>
        </form>
      </Card>
      <div className="grid gap-3">
        {builds.data?.map((build) => (
          <Card className="flex flex-wrap items-center gap-4 p-4" key={build.id}>
            <Boxes className="text-zinc-600" size={20} />
            <div>
              <p className="text-sm font-medium">{build.buildType}</p>
              <p className="mt-1 font-mono text-xs text-zinc-600">{build.commitSha}</p>
            </div>
            <Badge className="ml-auto" tone={statusTone(build.status)}>
              {build.status}
            </Badge>
            <Badge tone={build.signed ? "success" : "warning"}>
              {build.signed ? "서명됨" : "미서명"}
            </Badge>
            {build.artifactVersionId ? (
              <Button
                className="!bg-zinc-800 !text-zinc-200 hover:!bg-zinc-700"
                disabled={download.isPending}
                onClick={() => download.mutate(build.artifactVersionId!)}
              >
                다운로드
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
      <div className="grid gap-3">
        {releases.data?.map((release) => (
          <Card className="p-5" key={release.id}>
            <div className="flex flex-wrap items-center gap-3">
              <GitPullRequest className="text-zinc-600" size={20} />
              <div>
                <p className="text-sm font-medium">Release {release.id.slice(0, 8)}</p>
                <p className="mt-1 font-mono text-xs text-zinc-600">
                  {release.commitSha.slice(0, 12)} · PRD {release.prdSha256.slice(0, 12)}
                </p>
              </div>
              <Badge className="ml-auto" tone={statusTone(release.status)}>
                {release.status}
              </Badge>
            </div>
            {release.gateReport?.blockers?.length ? (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-300">
                {release.gateReport.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
            {release.status === "CANDIDATE" ? (
              <form
                className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  approve.mutate({
                    releaseId: release.id,
                    reason: approvalReasons[release.id] ?? "",
                  });
                }}
              >
                <input
                  className="factory-input flex-1"
                  minLength={5}
                  required
                  value={approvalReasons[release.id] ?? ""}
                  onChange={(event) =>
                    setApprovalReasons((current) => ({
                      ...current,
                      [release.id]: event.target.value,
                    }))
                  }
                  placeholder="최종 승인 사유"
                />
                <Button disabled={approve.isPending} type="submit">
                  Release Candidate 승인
                </Button>
              </form>
            ) : null}
            {release.status === "APPROVED" ? (
              <Button
                className="mt-4"
                disabled={sign.isPending}
                onClick={() => sign.mutate(release.id)}
              >
                Signing Worker 요청
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProjectOverview({ project }: { project: Project }) {
  const cards = [
    ["PRD 버전", project.counts?.prdVersions ?? 0, FileText],
    ["보관 파일", project.counts?.artifacts ?? 0, Files],
    ["열린 코멘트", project.counts?.openComments ?? 0, Activity],
    ["개발 작업", project.counts?.tasks ?? 0, Code2],
    ["보안 Finding", project.counts?.openFindings ?? 0, ShieldCheck],
    ["검토 결정", project.counts?.pendingApprovals ?? 0, ClipboardCheck],
  ] as const;
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, Icon]) => (
          <Card className="p-5" key={label}>
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <p className="mt-5 text-3xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h2 className="font-semibold">프로젝트 요약</h2>
        <p className="mt-3 leading-7 text-zinc-400">
          {project.summary || "프로젝트 요약이 아직 작성되지 않았습니다."}
        </p>
        <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 text-sm sm:grid-cols-3">
          <div>
            <span className="block text-xs text-zinc-600">상태</span>
            <Badge className="mt-2" tone={statusTone(project.status)}>
              {project.status}
            </Badge>
          </div>
          <div>
            <span className="block text-xs text-zinc-600">저장소</span>
            <span className="mt-2 block text-zinc-300">
              {project.repository
                ? `${project.repository.owner}/${project.repository.name}`
                : "연결 전"}
            </span>
          </div>
          <div>
            <span className="block text-xs text-zinc-600">마지막 변경</span>
            <span className="mt-2 block text-zinc-300">{formatSeoul(project.updatedAt)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ProjectWorkspace({
  projectId,
  auth,
  onBack,
}: {
  projectId: string;
  auth: AuthState;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<(typeof projectTabs)[number]>("개요");
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiRequest<Project>(`/projects/${projectId}`),
  });
  if (project.isPending) return <p className="text-sm text-zinc-500">프로젝트를 불러오는 중…</p>;
  if (project.error || !project.data) return <ErrorNotice error={project.error} />;
  const data = project.data;
  let content: ReactNode;
  if (tab === "개요") content = <ProjectOverview project={data} />;
  else if (tab === "PRD") content = <PrdWorkspace project={data} auth={auth} />;
  else if (tab === "CEO 제약사항")
    content = <DecisionPanel projectId={projectId} auth={auth} kind="constraints" />;
  else if (tab === "의사결정 기록")
    content = <DecisionPanel projectId={projectId} auth={auth} kind="decisions" />;
  else if (tab === "개발 작업")
    content = data.repository ? (
      <TasksPanel project={data} auth={auth} />
    ) : (
      <RepositoryPanel project={data} auth={auth} />
    );
  else if (tab === "코드 변경") content = <CodeChangesPanel projectId={projectId} />;
  else if (tab === "테스트") content = <TestRunsPanel projectId={projectId} />;
  else if (tab === "보안") content = <SecurityScansPanel projectId={projectId} auth={auth} />;
  else if (tab === "빌드") content = <BuildsPanel projectId={projectId} auth={auth} />;
  else if (tab === "파일" || tab === "시장조사")
    content = <FilesPanel projectId={projectId} auth={auth} />;
  else if (tab === "활동 기록") content = <ActivityPanel projectId={projectId} />;
  else {
    content = (
      <EmptyState
        icon={<Blocks size={20} />}
        title="기록이 아직 없습니다"
        description="해당 단계의 실제 Task, 보고서 또는 Artifact가 생성되면 이 영역에 연결됩니다."
      />
    );
  }
  return (
    <div className="grid gap-5">
      <button className="w-fit text-sm text-zinc-500 hover:text-white" onClick={onBack}>
        ← 전체 프로젝트
      </button>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{data.name}</h1>
            <Badge tone={statusTone(data.status)}>{data.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-zinc-500">{data.slug}</p>
        </div>
      </section>
      <div className="overflow-x-auto border-b border-zinc-800">
        <div className="flex min-w-max gap-1">
          {projectTabs.map((item) => (
            <button
              className={cn(
                "border-b-2 px-3 py-3 text-sm transition",
                item === tab
                  ? "border-emerald-400 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-200",
              )}
              key={item}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {content}
    </div>
  );
}

function QualityOverview({ focus }: { focus: "tests" | "security" | "builds" }) {
  const overview = useQuery({
    queryKey: ["quality-overview"],
    queryFn: () =>
      apiRequest<{
        tests: Array<Omit<TestRun, "results">>;
        scans: Array<Omit<SecurityScan, "findings"> & { findings: SecurityScan["findings"] }>;
        builds: FactoryBuild[];
        releases: FactoryRelease[];
      }>("/quality/overview"),
  });
  if (overview.error) return <ErrorNotice error={overview.error} />;
  const titles = {
    tests: ["테스트", "최근 Test Run과 Acceptance Criteria 검증 상태"],
    security: ["보안검사", "최근 Scanner 실행, Finding, SBOM 상태"],
    builds: ["빌드", "최근 APK/AAB 빌드와 Release Candidate"],
  } as const;
  const [title, description] = titles[focus];
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm font-medium text-emerald-300">QUALITY CONTROL</p>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>
      {focus === "tests" ? (
        <Card className="divide-y divide-zinc-800">
          {overview.data?.tests.map((run) => (
            <div className="flex flex-wrap items-center gap-3 p-4" key={run.id}>
              <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              <span className="text-sm">{run.command}</span>
              <span className="ml-auto font-mono text-xs text-zinc-600">
                {run.commitSha.slice(0, 12)}
              </span>
            </div>
          ))}
        </Card>
      ) : focus === "security" ? (
        <Card className="divide-y divide-zinc-800">
          {overview.data?.scans.map((scan) => (
            <div className="flex flex-wrap items-center gap-3 p-4" key={scan.id}>
              <Badge tone={statusTone(scan.status)}>{scan.status}</Badge>
              <span className="text-sm">{scan.scanner}</span>
              <span className="text-xs text-zinc-500">Finding {scan.findings.length}건</span>
              <span className="ml-auto text-xs text-zinc-500">
                SBOM {scan.sbomArtifactId ? "있음" : "없음"}
              </span>
            </div>
          ))}
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card className="divide-y divide-zinc-800">
            {overview.data?.builds.map((build) => (
              <div className="flex flex-wrap items-center gap-3 p-4" key={build.id}>
                <Badge tone={statusTone(build.status)}>{build.status}</Badge>
                <span className="text-sm">{build.buildType}</span>
                <Badge className="ml-auto" tone={build.signed ? "success" : "warning"}>
                  {build.signed ? "서명됨" : "미서명"}
                </Badge>
              </div>
            ))}
          </Card>
          <Card className="divide-y divide-zinc-800">
            {overview.data?.releases.map((release) => (
              <div className="flex flex-wrap items-center gap-3 p-4" key={release.id}>
                <Badge tone={statusTone(release.status)}>{release.status}</Badge>
                <span className="font-mono text-xs">{release.commitSha.slice(0, 12)}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {formatSeoul(release.createdAt)}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function AuditView() {
  const logs = useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      apiRequest<{
        items: Array<{
          id: string;
          action: string;
          resourceType: string;
          outcome: string;
          reason?: string;
          createdAt: string;
          requestId: string;
        }>;
      }>("/audit-logs"),
  });
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm font-medium text-emerald-300">IMMUTABLE HISTORY</p>
        <h1 className="mt-1 text-2xl font-semibold">감사 로그</h1>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-3">시간</th>
                <th className="px-5 py-3">액션</th>
                <th className="px-5 py-3">대상</th>
                <th className="px-5 py-3">결과</th>
                <th className="px-5 py-3">Request ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.data?.items.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-4 text-zinc-500">{formatSeoul(log.createdAt)}</td>
                  <td className="px-5 py-4 font-medium">{log.action}</td>
                  <td className="px-5 py-4 text-zinc-400">{log.resourceType}</td>
                  <td className="px-5 py-4">
                    <Badge tone={log.outcome === "SUCCESS" ? "success" : "danger"}>
                      {log.outcome}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-zinc-600">{log.requestId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ControlCenter({ auth, onSignedOut }: { auth: AuthState; onSignedOut: () => void }) {
  const [view, setView] = useState("dashboard");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiRequest<Project[]>("/projects"),
  });
  const logout = useMutation({
    mutationFn: () => apiRequest("/auth/logout", { method: "POST", csrfToken: auth.csrfToken }),
    onSuccess: onSignedOut,
  });
  const navigate = (target: string) => {
    setView(target);
    setSelectedProject(null);
    setMobileNav(false);
  };
  let content: ReactNode;
  if (selectedProject)
    content = (
      <ProjectWorkspace
        projectId={selectedProject}
        auth={auth}
        onBack={() => setSelectedProject(null)}
      />
    );
  else if (view === "audit") content = <AuditView />;
  else if (view === "tests" || view === "security" || view === "builds")
    content = <QualityOverview focus={view} />;
  else if (view === "dashboard" || view === "projects")
    content = (
      <Dashboard
        projects={projects.data ?? []}
        onCreate={() => setCreateOpen(true)}
        onOpen={(id) => setSelectedProject(id)}
      />
    );
  else
    content = (
      <EmptyState
        icon={<Blocks size={20} />}
        title={`${primaryNav.find(([id]) => id === view)?.[1] ?? view} 데이터가 아직 없습니다`}
        description="해당 실행 단계가 시작되면 실제 작업·검사·빌드 기록을 이 화면에서 검토하고 승인할 수 있습니다."
      />
    );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {mobileNav ? (
        <button
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          aria-label="메뉴 닫기"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] -translate-x-full flex-col border-r border-zinc-800 bg-zinc-950 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileNav && "translate-x-0",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5">
          <div className="grid size-9 place-items-center rounded-lg border border-emerald-800 bg-emerald-950 text-emerald-300">
            <Blocks size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold">Sandeul Factory</p>
            <p className="text-[10px] tracking-[0.18em] text-zinc-600">CEO CONTROL PLANE</p>
          </div>
          <button
            className="ml-auto text-zinc-500 lg:hidden"
            onClick={() => setMobileNav(false)}
            aria-label="메뉴 닫기"
          >
            <X size={19} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="주 메뉴">
          {primaryNav.map(([id, label, Icon]) => (
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                view === id && !selectedProject
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
              )}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={17} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-zinc-800 p-3">
          <div className="mb-2 rounded-lg bg-zinc-900 px-3 py-2">
            <p className="truncate text-xs font-medium text-zinc-300">{auth.user.email}</p>
            <p className="mt-1 text-[10px] text-emerald-400">{auth.user.role}</p>
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-white"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={15} /> 로그아웃
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur lg:px-7">
          <button
            className="text-zinc-400 lg:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={21} />
          </button>
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
            <input
              aria-label="프로젝트 검색"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-700"
              placeholder="프로젝트와 파일 검색"
            />
          </div>
          <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
            <span className="size-2 rounded-full bg-emerald-400" /> 시스템 정상
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 lg:p-7">{content}</main>
      </div>
      <CreateProjectModal open={createOpen} auth={auth} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
