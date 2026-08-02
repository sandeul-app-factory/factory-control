"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Modal, cn } from "@sandeul/ui";
import {
  Archive,
  Blocks,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Code2,
  Download,
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
  Search,
  Settings,
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
  FactorySettings,
  McpCredential,
  PrdVersion,
  Project,
} from "../lib/types";

const primaryNav = [
  ["dashboard", "대시보드", Gauge],
  ["projects", "프로젝트", FolderKanban],
  ["tasks", "개발 작업", Code2],
  ["audit", "감사 로그", History],
  ["settings", "설정", Settings],
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

function displayStatus(status?: string | null): string {
  if (!status) return "대기";
  const labels: Record<string, string> = {
    DRAFT: "시작 대기",
    QUEUED: "실행 대기",
    STARTING: "시작 중",
    RUNNING: "진행 중",
    CANCEL_REQUESTED: "중단 처리 중",
    CANCELLED: "중단됨",
    SUCCEEDED: "완료",
    PASSED: "통과",
    FAILED: "실패",
    TIMED_OUT: "시간 초과",
    DEAD_LETTER: "재시도 종료",
    PENDING: "대기",
    BUILDING: "빌드 중",
    GATE_BLOCKED: "출시 차단",
    CANDIDATE: "Release Candidate",
    APPROVED: "출시 준비",
    SIGNED: "서명 완료",
    RELEASED: "출시 완료",
    NOT_STARTED: "시작 전",
  };
  return labels[status] ?? status;
}

function displayTaskType(type: string): string {
  const labels: Record<string, string> = {
    REPO_BOOTSTRAP: "Repository 준비",
    IMPLEMENT_PRD: "PRD 구현",
    IMPLEMENT_FEATURE: "기능 추가",
    FIX_REVIEW: "리뷰 수정",
    FIX_TEST: "테스트 수정",
    FIX_SECURITY: "보안 수정",
    REFACTOR_APPROVED_SCOPE: "정의 범위 Refactor",
    BUILD_RELEASE_CANDIDATE: "Release Candidate 빌드",
    GENERATE_DOCUMENTATION: "문서 생성",
  };
  return labels[type] ?? type;
}

function taskProgressSummary(status: string, runStatus?: string | null): string {
  const effective = runStatus ?? status;
  const summaries: Record<string, string> = {
    DRAFT: "PRD와 Repository가 준비되었습니다. 개발 시작을 누르면 Codex에 전달됩니다.",
    QUEUED: "Codex Worker의 실행 순서를 기다리고 있습니다.",
    STARTING: "Repository와 잠긴 PRD 해시를 검증하고 있습니다.",
    RUNNING: "Codex가 구현하고 있습니다. 완료 후 테스트·보안검사·빌드 결과가 이어집니다.",
    CANCELLING: "Codex 프로세스와 Queue 작업을 안전하게 중단하고 있습니다.",
    CANCELLED: "사용자 요청으로 작업이 중단되었습니다.",
    SUCCEEDED: "구현 작업이 완료되었습니다. 아래 검증·빌드 상태와 완료 요약을 확인하세요.",
    FAILED: "작업이 완료되지 못했습니다. 완료 요약을 확인한 뒤 후속 지시로 재작업할 수 있습니다.",
    TIMED_OUT: "제한 시간 내에 완료되지 않아 작업을 종료했습니다.",
    DEAD_LETTER: "자동 재시도까지 실패했습니다. 원인을 수정한 뒤 후속 지시를 등록하세요.",
  };
  return summaries[effective] ?? "Factory가 작업 상태를 확인하고 있습니다.";
}

function runEventSummary(event: DevelopmentTaskDetail["events"][number]): string {
  const raw = event.message.trim();
  if (raw.startsWith("{") || raw.startsWith("[")) {
    if (event.eventType === "thread.started") return "Codex 개발 세션을 시작했습니다.";
    if (event.eventType === "turn.started") return "요구사항을 분석하고 구현을 시작했습니다.";
    if (event.eventType === "turn.completed") return "Codex 구현 단계가 완료되었습니다.";
    if (event.eventType === "item.started") return "Codex가 다음 개발 단계를 시작했습니다.";
    if (event.eventType === "item.completed") return "Codex가 개발 단계 하나를 완료했습니다.";
    return "Codex 작업 상태가 갱신되었습니다.";
  }
  return raw.length > 600 ? `${raw.slice(0, 600)}…` : raw;
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
  const prepared = projects.filter((project) =>
    /PRD_LOCKED|REPO_READY|DEVELOP|CODE_REVIEW|QA_TESTING|SECURITY_REVIEW|RELEASE|BUILT/.test(
      project.status,
    ),
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
            PRD·디자인·Repository를 준비하고 개발 파이프라인을 한눈에 확인합니다.
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
            ["개발 준비", prepared, FileCheck2, "text-amber-300"],
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
      data.set("submitForReview", "false");
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
      description="최종 PRD를 직접 업로드합니다. 서버 Schema와 파일 규칙을 통과하면 SHA-256을 기록하고 개발용 PRD로 자동 잠금합니다."
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
          최종 PRD 파일
          <input
            className="factory-input file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-200"
            name="file"
            type="file"
            accept=".md,.json,text/markdown,application/json"
            required
          />
          <span className="text-xs leading-5 text-zinc-500">
            전체 Schema를 검사하는 JSON을 권장합니다. Markdown은 필수 제목과 별도 입력한 Acceptance
            Criteria를 검사합니다.
          </span>
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
            <Upload size={16} /> {mutation.isPending ? "검증·저장 중…" : "검증 후 저장"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PrdWorkspace({ project, auth }: { project: Project; auth: AuthState }) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
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
      <Card className="p-5 xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-emerald-300">
              <BookOpenCheck size={19} />
              <p className="text-sm font-semibold">PRD 준비</p>
            </div>
            <h2 className="mt-2 text-lg font-semibold">
              ChatGPT Plus에서 기획을 완성한 뒤 최종본만 Factory에 제출하세요.
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              가이드와 최신 JSON Schema를 ChatGPT 프로젝트에 첨부하고 반려·재기획을 마친 다음, 최종{" "}
              <code>prd.json</code>을 업로드합니다. 서버 검증을 통과한 버전은 자동 잠금되며,
              Repository를 준비한 뒤 개발 작업 탭에서 Codex를 시작할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              download
              href="/templates/SANDEUL_ANDROID_PRD_GUIDE.md"
            >
              <Download size={16} /> 작성 가이드
            </a>
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              download
              href="/api/prd-authoring/schema"
            >
              <Download size={16} /> 최신 JSON Schema
            </a>
          </div>
        </div>
        <ol className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["1", "ChatGPT 기획", "가이드·Schema를 첨부하고 대화로 기획을 완성"],
            ["2", "직접 제출", "최종 prd.json을 Factory에 업로드"],
            ["3", "자동 확정", "Schema 검증·SHA-256 저장·PRD 잠금"],
            ["4", "개발 시작", "Repository 준비 후 개발 작업 탭에서 시작"],
          ].map(([number, title, description]) => (
            <li className="flex gap-3" key={number}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-950 text-xs font-semibold text-emerald-300">
                {number}
              </span>
              <span>
                <strong className="block text-zinc-200">{title}</strong>
                <span className="mt-1 block leading-5 text-zinc-500">{description}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
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
                  <Button
                    className="!bg-zinc-800 !text-zinc-200"
                    onClick={() => setUploadOpen(true)}
                  >
                    새 버전
                  </Button>
                </div>
              </div>
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
            title="최종 PRD를 직접 제출하세요"
            description="ChatGPT에서 검토와 재기획을 끝낸 Markdown 또는 구조화 JSON을 서버 검증 후 개발용 PRD로 저장합니다."
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

function DesignPanel({ projectId, auth }: { projectId: string; auth: AuthState }) {
  const queryClient = useQueryClient();
  const artifacts = useQuery({
    queryKey: ["artifacts", projectId],
    queryFn: () => apiRequest<Artifact[]>(`/projects/${projectId}/artifacts`),
  });
  const designs = (artifacts.data ?? []).filter(
    (artifact) => artifact.kind === "UX" && artifact.logicalFolder === "03 UX",
  );
  const upload = useMutation({
    mutationFn: (form: HTMLFormElement) =>
      apiRequest<Artifact>(`/projects/${projectId}/artifacts/UX/03%20UX`, {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: new FormData(form),
      }),
    onSuccess: async (_artifact, form) => {
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifacts", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
      ]);
    },
  });
  const download = useMutation({
    mutationFn: (versionId: string) =>
      apiRequest<{ url: string }>(`/artifact-versions/${versionId}/download`),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,420px)_1fr]">
      <Card className="h-fit p-5">
        <div className="flex items-center gap-2">
          <Upload className="text-emerald-300" size={18} />
          <h2 className="font-semibold">Figma 디자인 도안</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Figma에서 내보낸 PNG, JPG, WebP 또는 PDF를 업로드하세요. 화면 의도, 상호작용, 상태별
          차이는 설명에 기록하면 Codex 작업 자료로 함께 보관됩니다.
        </p>
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate(event.currentTarget);
          }}
        >
          <label className="grid gap-2 text-sm">
            디자인 파일
            <input
              className="factory-input file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-200"
              name="file"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
              required
            />
          </label>
          <label className="grid gap-2 text-sm">
            디자인 설명
            <textarea
              className="factory-input min-h-32 py-3"
              maxLength={4000}
              name="description"
              placeholder="대상 화면, 사용자 흐름, 클릭 동작, 필수 컬러·간격, 라이트/다크 상태 등"
              required
            />
          </label>
          <ErrorNotice error={upload.error} />
          <Button disabled={upload.isPending} type="submit">
            {upload.isPending ? "검증·업로드 중…" : "디자인 업로드"}
          </Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h3 className="font-semibold">디자인 자료</h3>
          <p className="mt-1 text-xs text-zinc-500">03 UX · 파일별 SHA-256 보관</p>
        </div>
        <div className="divide-y divide-zinc-800">
          {designs.map((artifact) => {
            const version = artifact.versions[0];
            return (
              <div className="p-5" key={artifact.id}>
                <div className="flex flex-wrap items-start gap-3">
                  <FileCheck2 className="mt-0.5 text-emerald-300" size={18} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{artifact.name}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                      {artifact.description || "설명이 없습니다."}
                    </p>
                    {version ? (
                      <p className="mt-3 break-all font-mono text-[11px] text-zinc-600">
                        SHA-256 {version.sha256}
                      </p>
                    ) : null}
                  </div>
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
              </div>
            );
          })}
          {!artifacts.isPending && !designs.length ? (
            <p className="p-6 text-sm text-zinc-500">업로드된 디자인 도안이 없습니다.</p>
          ) : null}
        </div>
      </Card>
    </div>
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
        description="서버 검증을 통과한 PRD가 자동 잠금되면 기존 Repository를 연결하거나 새 Repository를 만들 수 있습니다."
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
    refetchInterval: 15_000,
  });
  const latestRun = detail.data?.runs[0];
  const latestRunId = latestRun?.id;
  const latestRunStatus = latestRun?.status;
  useEffect(() => {
    if (
      !latestRunId ||
      !latestRunStatus ||
      !["QUEUED", "STARTING", "RUNNING", "CANCELLING"].includes(latestRunStatus)
    ) {
      return;
    }
    const cached = queryClient.getQueryData<DevelopmentTaskDetail>(["task", taskId]);
    const after = Math.max(
      0,
      ...(cached?.events
        .filter((event) => event.codexRunId === latestRunId)
        .map((event) => event.sequence) ?? []),
    );
    const base = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    const source = new EventSource(
      `${base}/codex-runs/${latestRunId}/events?after=${String(after)}`,
    );
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    source.onmessage = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      }, 2_000);
    };
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      source.close();
    };
  }, [latestRunId, latestRunStatus, queryClient, taskId]);
  const cancel = useMutation({
    mutationFn: () =>
      apiRequest(`/tasks/${taskId}/cancel`, {
        method: "POST",
        csrfToken: auth.csrfToken,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
  });
  const start = useMutation({
    mutationFn: () =>
      apiRequest(`/tasks/${taskId}/start`, {
        method: "POST",
        csrfToken: auth.csrfToken,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
    },
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
  const pipelineStages = [
    ["개발", latestRun?.status ?? data.status],
    ["테스트", data.pipeline.testRun?.status ?? "NOT_STARTED"],
    ["보안검사", data.pipeline.securityScan?.status ?? "NOT_STARTED"],
    ["빌드", data.pipeline.build?.status ?? "NOT_STARTED"],
    ["Release Gate", data.pipeline.release?.status ?? "NOT_STARTED"],
  ] as const;
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge>{displayTaskType(data.type)}</Badge>
              <Badge tone={statusTone(data.status)}>{displayStatus(data.status)}</Badge>
            </div>
            <h3 className="mt-3 text-lg font-semibold">{data.title}</h3>
            <p className="mt-2 font-mono text-xs text-zinc-600">
              Locked PRD {data.lockedPrdSha256}
            </p>
          </div>
          {data.status === "DRAFT" ? (
            <Button disabled={start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? "개발 시작 처리 중…" : "개발 시작"}
            </Button>
          ) : active ? (
            <Button
              className="!bg-red-950 !text-red-200 hover:!bg-red-900"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              작업 중단
            </Button>
          ) : null}
        </div>
        <ErrorNotice error={start.error ?? cancel.error} />
      </Card>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-300">현재 진행 상태</p>
            <h3 className="mt-2 text-xl font-semibold">
              {displayStatus(latestRun?.status ?? data.status)}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              {taskProgressSummary(data.status, latestRun?.status)}
            </p>
          </div>
          {data.job ? (
            <span className="text-xs text-zinc-600">
              실행 {data.job.attempts}/{data.job.maxAttempts}
            </span>
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 sm:grid-cols-2 xl:grid-cols-5">
          {pipelineStages.map(([label, status]) => (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3" key={label}>
              <span className="block text-xs text-zinc-600">{label}</span>
              <Badge className="mt-2" tone={statusTone(status)}>
                {displayStatus(status)}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="font-semibold">진행 요약</h3>
            <p className="mt-1 text-xs text-zinc-500">실시간 작업 이벤트를 읽기 쉽게 요약합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            {active ? <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> : null}
            <Badge tone={statusTone(latestRun?.status ?? data.status)}>
              {displayStatus(latestRun?.status ?? data.status)}
            </Badge>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto bg-zinc-950 p-4 text-sm leading-6">
          {runEvents.length ? (
            runEvents.map((event) => (
              <div className="grid grid-cols-[68px_1fr] gap-3 py-1" key={event.id}>
                <span className="text-xs text-zinc-700">
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(event.createdAt))}
                </span>
                <span className={event.level === "ERROR" ? "text-red-300" : "text-zinc-400"}>
                  {runEventSummary(event)}
                </span>
              </div>
            ))
          ) : (
            <span className="text-zinc-600">
              {data.status === "DRAFT"
                ? "PRD가 전달됐습니다. 검토 후 개발 시작을 눌러주세요."
                : "Worker 이벤트를 기다리는 중입니다."}
            </span>
          )}
        </div>
      </Card>
      {latestRun?.finalMessage || latestRun?.errorMessage ? (
        <Card className="p-5">
          <h3 className="font-semibold">완료 보고</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-400">
            {latestRun.finalMessage ?? taskProgressSummary(data.status, latestRun.status)}
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
      {latestRun?.resultJson?.changedFiles?.length ? (
        <Card className="p-5">
          <h3 className="font-semibold">변경 요약</h3>
          <div className="mt-4 grid gap-3">
            {latestRun.resultJson.changedFiles.map((file) => (
              <div className="rounded-lg border border-zinc-800 p-3" key={file.path}>
                <code className="text-xs text-emerald-300">{file.path}</code>
                <p className="mt-2 text-sm text-zinc-400">{file.reason}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {!active && data.status !== "DRAFT" ? (
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
    refetchInterval: 15_000,
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
                  <Badge>{displayTaskType(task.type)}</Badge>
                  <Badge tone={statusTone(task.status)}>{displayStatus(task.status)}</Badge>
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
            <h3 className="font-semibold">추가 Codex 작업 초안</h3>
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
                <option value="REFACTOR_APPROVED_SCOPE">정의 범위 Refactor</option>
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
                {create.isPending ? "초안 생성 중…" : "Codex 작업 초안 생성"}
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
          description="잠긴 PRD와 Repository가 준비되면 정의된 범위의 Codex 작업을 생성할 수 있습니다."
        />
      )}
    </div>
  );
}

function DevelopmentWorkView({ projects, auth }: { projects: Project[]; auth: AuthState }) {
  const recentTasks = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => apiRequest<DevelopmentTask[]>("/tasks"),
    refetchInterval: 15_000,
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    if (projectId) return;
    setProjectId(recentTasks.data?.[0]?.projectId ?? projects[0]?.id ?? null);
  }, [projectId, projects, recentTasks.data]);
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiRequest<Project>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });
  return (
    <div className="grid gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-300">DEVELOPMENT PIPELINE</p>
          <h1 className="mt-1 text-2xl font-semibold">개발 작업</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Codex 구현부터 테스트·보안검사·빌드까지 하나의 작업 화면에서 확인합니다.
          </p>
        </div>
        <label className="grid min-w-64 gap-2 text-xs text-zinc-500">
          프로젝트
          <select
            className="factory-input"
            value={projectId ?? ""}
            onChange={(event) => setProjectId(event.target.value || null)}
          >
            <option value="">프로젝트 선택</option>
            {projects.map((item) => {
              const count =
                recentTasks.data?.filter((task) => task.projectId === item.id).length ?? 0;
              return (
                <option key={item.id} value={item.id}>
                  {item.name} · 작업 {count}건
                </option>
              );
            })}
          </select>
        </label>
      </section>
      <ErrorNotice error={recentTasks.error ?? project.error} />
      {project.data ? (
        <TasksPanel key={project.data.id} project={project.data} auth={auth} />
      ) : !project.isPending ? (
        <EmptyState
          icon={<TerminalSquare size={20} />}
          title="개발할 프로젝트를 선택하세요"
          description="PRD와 Repository를 준비한 프로젝트의 Codex 작업을 이곳에서 시작합니다."
        />
      ) : (
        <p className="text-sm text-zinc-500">개발 작업을 불러오는 중…</p>
      )}
    </div>
  );
}

function ProjectOverview({ project }: { project: Project }) {
  const cards = [
    [
      "PRD",
      project.counts?.prdVersions ? `${project.counts.prdVersions}개 버전` : "준비 전",
      FileText,
    ],
    ["디자인·자료", `${project.counts?.artifacts ?? 0}개 파일`, Files],
    [
      "Repository",
      project.repository ? `${project.repository.owner}/${project.repository.name}` : "연결 전",
      GitBranch,
    ],
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
            <p className="mt-5 truncate text-lg font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h2 className="font-semibold">준비 현황</h2>
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
            <span className="block text-xs text-zinc-600">개발 작업</span>
            <span className="mt-2 block text-zinc-300">{project.counts?.tasks ?? 0}건</span>
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
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiRequest<Project>(`/projects/${projectId}`),
  });
  if (project.isPending) return <p className="text-sm text-zinc-500">프로젝트를 불러오는 중…</p>;
  if (project.error || !project.data) return <ErrorNotice error={project.error} />;
  const data = project.data;
  return (
    <div className="grid gap-8">
      <button className="w-fit text-sm text-zinc-500 hover:text-white" onClick={onBack}>
        ← 전체 프로젝트
      </button>
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{data.name}</h1>
            <Badge tone={statusTone(data.status)}>{data.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-zinc-500">{data.slug}</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="프로젝트 준비 영역">
          {[
            ["#project-prd", "PRD"],
            ["#project-design", "디자인"],
            ["#project-repository", "Repository"],
          ].map(([href, label]) => (
            <a
              className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-400 hover:border-zinc-700 hover:text-white"
              href={href}
              key={href}
            >
              {label}
            </a>
          ))}
        </nav>
      </section>
      <ProjectOverview project={data} />
      <section className="scroll-mt-20" id="project-prd">
        <PrdWorkspace project={data} auth={auth} />
      </section>
      <section className="scroll-mt-20" id="project-design">
        <DesignPanel projectId={projectId} auth={auth} />
      </section>
      <section className="scroll-mt-20" id="project-repository">
        <RepositoryPanel project={data} auth={auth} />
      </section>
      <details className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-300">
          추가 지침·기록·전체 파일
        </summary>
        <p className="mt-2 text-sm text-zinc-500">
          기존 데이터와 Codex 우선순위 규칙을 보존하기 위한 고급 영역입니다.
        </p>
        <div className="mt-5 grid gap-5">
          <DecisionPanel projectId={projectId} auth={auth} kind="constraints" />
          <DecisionPanel projectId={projectId} auth={auth} kind="decisions" />
          <FilesPanel projectId={projectId} auth={auth} />
          <ActivityPanel projectId={projectId} />
        </div>
      </details>
    </div>
  );
}

function SettingsView({ auth, onSignedOut }: { auth: AuthState; onSignedOut: () => void }) {
  const queryClient = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiRequest<FactorySettings>("/settings"),
  });
  const credentials = useQuery({
    queryKey: ["mcp-credentials"],
    queryFn: () => apiRequest<McpCredential[]>("/settings/mcp-credentials"),
  });
  const createCredential = useMutation({
    mutationFn: (payload: {
      name: string;
      scopes: string[];
      rateLimit: number;
      expiresAt?: string;
    }) =>
      apiRequest<McpCredential>("/settings/mcp-credentials", {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify(payload),
      }),
    onSuccess: async (credential) => {
      setIssuedToken(credential.token ?? null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["mcp-credentials"] }),
      ]);
    },
  });
  const revokeCredential = useMutation({
    mutationFn: (credentialId: string) =>
      apiRequest(`/settings/mcp-credentials/${credentialId}/revoke`, {
        method: "POST",
        csrfToken: auth.csrfToken,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["mcp-credentials"] }),
      ]);
    },
  });
  const changePassword = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      apiRequest("/auth/password", {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: JSON.stringify(payload),
      }),
    onSuccess: onSignedOut,
  });
  const revokeSessions = useMutation({
    mutationFn: () =>
      apiRequest("/auth/sessions/revoke-all", {
        method: "POST",
        csrfToken: auth.csrfToken,
      }),
    onSuccess: onSignedOut,
  });
  const error =
    settings.error ||
    credentials.error ||
    createCredential.error ||
    revokeCredential.error ||
    changePassword.error ||
    revokeSessions.error;
  const config = settings.data;
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm font-medium text-emerald-300">ADMINISTRATION</p>
        <h1 className="mt-1 text-2xl font-semibold">설정</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Secret 값은 표시하지 않으며 Adapter와 보안 경계의 활성 상태만 보여줍니다.
        </p>
      </div>
      <ErrorNotice error={error} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Public URL", config?.publicUrl ?? "—"],
          ["GitHub", config?.githubAdapter ?? "—"],
          ["Codex", `${config?.codexAdapter ?? "—"} · 동시 ${config?.codexConcurrency ?? 1}`],
          ["PRD 확정", config?.prdApprovalEnabled ? "승인 흐름" : "검증 후 자동 잠금"],
          [
            "MCP",
            config?.mcpEnabled
              ? config.mcpWriteEnabled
                ? "활성 · 읽기/쓰기"
                : "활성 · 읽기 전용"
              : "비활성",
          ],
          ["Signing Worker", config?.signingWorkerEnabled ? "활성" : "비활성 Stub"],
          ["Session Cookie", config?.sessionSecure ? "Secure" : "개발 모드"],
          ["SameSite", config?.sessionSameSite ?? "—"],
          ["시간대", config?.timezone ?? "Asia/Seoul"],
        ].map(([label, value]) => (
          <Card className="p-4" key={label}>
            <p className="text-xs text-zinc-600">{label}</p>
            <p className="mt-2 break-all text-sm font-medium">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">MCP Credential</h2>
            <p className="mt-2 text-sm text-zinc-500">
              수동 PRD가 기본 경로이며 ChatGPT Plus 사용에는 Credential이 필요하지 않습니다. MCP를
              켠 경우에도 기본값은 읽기 전용입니다. Endpoint:{" "}
              <code>{config?.publicUrl ?? "https://factory.sandeul.work"}/api/mcp</code>
            </p>
          </div>
          <Badge tone={config?.mcpEnabled ? "success" : "warning"}>
            {config?.mcpEnabled
              ? config.mcpWriteEnabled
                ? "MCP READ/WRITE"
                : "MCP READ ONLY"
              : "MCP DISABLED"}
          </Badge>
        </div>
        {issuedToken ? (
          <div className="mt-4 rounded-lg border border-amber-800 bg-amber-950/30 p-4">
            <p className="text-sm font-medium text-amber-200">한 번만 표시되는 Token</p>
            <code className="mt-2 block break-all text-xs text-amber-100">{issuedToken}</code>
            <div className="mt-3 flex items-center gap-3">
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(issuedToken);
                }}
              >
                복사
              </Button>
              <button className="text-xs text-zinc-500" onClick={() => setIssuedToken(null)}>
                화면에서 지우기
              </button>
            </div>
          </div>
        ) : null}
        <form
          className="mt-5 grid gap-3 lg:grid-cols-[200px_1fr_120px_180px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const expiresAt = formString(data, "expiresAt");
            createCredential.mutate({
              name: formString(data, "name"),
              scopes: formString(data, "scopes")
                .split(",")
                .map((scope) => scope.trim())
                .filter(Boolean),
              rateLimit: Number(formString(data, "rateLimit")),
              ...(expiresAt
                ? { expiresAt: new Date(`${expiresAt}T23:59:59+09:00`).toISOString() }
                : {}),
            });
          }}
        >
          <input className="factory-input" name="name" required placeholder="Credential 이름" />
          <input
            className="factory-input"
            name="scopes"
            required
            placeholder="factory.get_prd_schema,factory.list_projects"
          />
          <input
            aria-label="분당 요청 수"
            className="factory-input"
            defaultValue="30"
            max="1000"
            min="1"
            name="rateLimit"
            required
            type="number"
          />
          <input
            aria-label="Credential 만료일"
            className="factory-input"
            name="expiresAt"
            type="date"
          />
          <Button disabled={createCredential.isPending} type="submit">
            발급
          </Button>
        </form>
        <div className="mt-5 divide-y divide-zinc-800 border-t border-zinc-800">
          {credentials.data?.map((credential) => (
            <div className="flex flex-wrap items-center gap-3 py-4" key={credential.id}>
              <div>
                <p className="text-sm font-medium">{credential.name}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {credential.scopes.join(", ")} · 분당 {credential.rateLimit}
                </p>
              </div>
              <Badge className="ml-auto" tone={statusTone(credential.status)}>
                {credential.status}
              </Badge>
              {!credential.revokedAt ? (
                <Button
                  className="!bg-red-950 !text-red-300 hover:!bg-red-900"
                  disabled={revokeCredential.isPending}
                  onClick={() => revokeCredential.mutate(credential.id)}
                >
                  폐기
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">비밀번호 변경</h2>
          <p className="mt-2 text-sm text-zinc-500">변경 후 모든 Session이 강제 종료됩니다.</p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const newPassword = formString(data, "newPassword");
              if (newPassword !== formString(data, "confirmPassword")) {
                setPasswordError("새 비밀번호 확인이 일치하지 않습니다.");
                return;
              }
              setPasswordError(null);
              changePassword.mutate({
                currentPassword: formString(data, "currentPassword"),
                newPassword,
              });
            }}
          >
            <input
              autoComplete="current-password"
              className="factory-input"
              name="currentPassword"
              placeholder="현재 비밀번호"
              required
              type="password"
            />
            <input
              autoComplete="new-password"
              className="factory-input"
              minLength={14}
              name="newPassword"
              placeholder="새 비밀번호"
              required
              type="password"
            />
            <input
              autoComplete="new-password"
              className="factory-input"
              minLength={14}
              name="confirmPassword"
              placeholder="새 비밀번호 확인"
              required
              type="password"
            />
            {passwordError ? (
              <p className="text-sm text-red-300" role="alert">
                {passwordError}
              </p>
            ) : null}
            <Button disabled={changePassword.isPending} type="submit">
              비밀번호 변경
            </Button>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Session 강제 종료</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            현재 Session을 포함해 이 관리자 계정의 모든 Session을 폐기합니다. 다시 로그인해야
            합니다.
          </p>
          <Button
            className="mt-5 !bg-red-950 !text-red-300 hover:!bg-red-900"
            disabled={revokeSessions.isPending}
            onClick={() => revokeSessions.mutate()}
          >
            모든 Session 종료
          </Button>
        </Card>
      </div>
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
  else if (view === "settings") content = <SettingsView auth={auth} onSignedOut={onSignedOut} />;
  else if (view === "tasks")
    content = <DevelopmentWorkView projects={projects.data ?? []} auth={auth} />;
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
