# Sandeul App Factory v2 Project Context

> 새 ChatGPT/Codex 세션의 첫 진입 문서다. 마지막 검토일은 2026-08-03이다.
> 코드나 운영 상태가 이 문서와 다르면 실제 코드와 읽기 전용 운영 점검을 우선하고,
> 차이를 확인한 뒤 이 문서도 함께 갱신한다.

## 1. 이 프로젝트가 만드는 것

Sandeul App Factory v2는 Android 앱을 반복적으로 제작하기 위한 중앙 Control Plane이다.
CEO 사용자가 최종 제품 요구사항과 디자인을 Factory에 넣으면, 격리된 Codex Worker가
앱별 GitHub Repository에서 구현·테스트·보안검사·SBOM·빌드를 수행하고 결과를 Factory로
돌려준다.

Factory가 기획을 대신 생성하지는 않는다. ChatGPT 웹에서 사용자와 기획을 끝낸 다음
Build-ready `prd.json`을 Factory 웹에 직접 업로드한다. Factory 백엔드는 PRD 생성을 위해
OpenAI API를 호출하지 않는다.

핵심 책임은 다음처럼 나뉜다.

- ChatGPT: 아이디어 구체화, 조사, 위험 검토와 최종 PRD 작성
- CEO: PRD와 디자인 검토, 프로젝트/Repository 준비, 개발 시작과 결과 판단
- Factory Web/API: 입력 검증, 상태·감사·작업·Artifact·Release Gate 통제
- Codex Worker: 잠긴 PRD와 현재 Task 범위 안에서만 개발 실행
- GitHub: 소스코드의 유일한 원본
- PostgreSQL/Redis/MinIO: Metadata·Queue·Artifact 저장

## 2. 현재 사용자 흐름

현재 제품은 승인 화면을 반복하는 초기 설계보다 단순화되어 있다.

1. CEO가 프로젝트를 생성한다.
2. ChatGPT에서 확정한 `prd.json`을 업로드한다.
3. API가 PRD Schema와 파일 무결성을 검사하고 Canonical PRD로 자동 잠근다.
4. Figma 화면 PNG 여러 장과 화면별 통합 디자인 스펙 Markdown을 일괄 업로드한다.
5. 기존 GitHub Repository를 연결하거나 Template 기반 생성을 요청한다.
6. `IMPLEMENT_PRD` Development Task를 만들고 CEO가 시작한다.
7. Worker가 Codex 구현 → Commit/push → PR → 테스트 → 보안검사 → SBOM → Android
   빌드 → Release Gate를 한 작업 흐름으로 실행한다.
8. Web의 `개발 작업` 화면에서 원문 JSONL 대신 상태와 한국어 요약을 확인한다.
9. Gate를 통과하면 Release Candidate와 APK/AAB Artifact를 확인한다.

`PRD_APPROVAL_ENABLED=false`와 `APPROVAL_WORKFLOW_ENABLED=false`가 현재 기본 정책이다.
승인 UI가 비활성화되어도 PRD hash 검증, 테스트, 보안검사, SBOM과 Release Gate는
우회하지 않는다.

디자인 입력 규칙:

- PNG/JPG/WebP/PDF/MD를 한 번에 최대 30개 선택할 수 있다.
- 통합 Markdown이 있으면 이미지별 설명은 선택사항이다.
- Markdown이 없으면 각 화면 이미지 설명이 필요하다.
- Markdown은 PRD 화면 ID·기능명·원본 이미지 파일명을 명시해야 한다.
- Worker는 Markdown을 먼저 읽고 PRD와 화면 이미지를 이름/ID로 대응한다.
- 같은 이름을 다시 올리면 이력은 보존하고 다음 작업에는 최신 파일을 전달한다.

## 3. 요구사항 권위와 변경 원칙

요구사항 충돌 시 우선순위는 다음과 같다.

1. 잠긴 PRD
2. CEO Constraint
3. Decision Record
4. 현재 Development Task와 최신 TaskInstructionVersion
5. Acceptance Criteria
6. Repository의 `AGENTS.md`
7. 기존 코드 규칙

Codex는 제품 요구사항을 독자적으로 확장하거나 축소하지 않는다. 모호한 내용은 임의로
구현하지 말고 질문·가정·미완료 항목으로 남긴다. 관련 없는 Refactor, 테스트 skip,
보안검사 우회, 자동 PR merge와 실제 Release 서명은 금지한다.

기존 GitHub 조직·Repository·Secrets·도메인·DNS·Cloudflare Tunnel을 삭제하거나
재생성하지 않는다. 원격 기본 브랜치 변경, force push, 앱 Repository의 임의 변경도
하지 않는다.

## 4. Repository와 Architecture

- 원격 저장소: `https://github.com/sandeul-app-factory/factory-control.git`
- 개발 브랜치: `rebuild/factory-v2`
- macOS 목표 경로: `/Users/sandeul/workspace/app-factory/factory-control`
- 공개 주소: `https://factory.sandeul.work`

```text
apps/
  web/       Next.js App Router 기반 한국어 CEO Control Center
  api/       NestJS REST/OpenAPI, 인증·권한·상태·감사·SSE·MCP
  worker/    BullMQ 소비자, Codex·Git·검사·Android 빌드 오케스트레이션
packages/
  contracts/ 공유 DTO, enum, Zod Schema, 상태 머신
  database/  Prisma Schema/client, migration, 관리자 CLI
  ui/        공통 UI primitive
  github/    GitHub App/PAT/Fake Adapter
  codex/     Prompt builder, Real/Fake Adapter, 결과 Schema
  storage/   S3/MinIO와 업로드 검증
  security/  Release Gate, CSRF/Webhook/hash/redaction 정책
infra/
  docker/        애플리케이션/Worker 이미지
  cloudflared/   Factory 전용 Tunnel Compose와 Secret 없는 config 예제
  reverse-proxy/ loopback Nginx gateway
  scripts/       백업·복구·Worker 운영 스크립트
  systemd/       Linux host Worker 예제
docs/            Architecture·운영·보안·API·PRD 안내
schemas/         PRD·Codex·Artifact JSON Schema
```

Architecture 경계:

- Web은 REST/SSE contract만 사용하고 DB·Redis·GitHub SDK를 직접 호출하지 않는다.
- API가 인증·RBAC·CSRF·상태 전환·감사·idempotency의 최종 판단자다.
- Queue에는 ID만 넣고 Worker가 DB/Object Storage에서 권위 있는 snapshot을 다시 읽는다.
- 사용자 지시는 Shell 명령이 아니라 Codex prompt 데이터다.
- Worker는 고정 executable과 검증된 argument만 `shell: false`로 실행한다.
- Codex child process에는 GitHub Secret과 signing key를 전달하지 않는다.
- GitHub에는 소스, Factory에는 PRD·보고서·Artifact metadata와 hash를 보관한다.

## 5. 개발 작업 실행 경계

Worker의 기본 동시성은 1이다. 각 실행은 다음 경로 아래 격리된 clone/worktree를 쓴다.

```text
{CODEX_WORKSPACE_ROOT}/{projectId}/{taskId}/{codexRunId}/
```

Worker는 실행 직전에 다음을 다시 검증한다.

- 잠긴 PRD와 SHA-256
- CEO Constraint와 Decision Record
- 최신 TaskInstructionVersion과 Acceptance Criteria
- 대상 Repository, branch와 commit
- Repository의 `AGENTS.md`
- 허용/금지 경로
- 디자인 Artifact와 각 SHA-256
- 허용된 테스트 명령과 보안 정책

Real Adapter는 `codex exec --sandbox workspace-write --json`을 사용한다.
`danger-full-access`는 허용하지 않는다. JSONL은 DB에 보존하되 일반 사용자 UI에는
안전한 상태와 요약만 노출한다.

## 6. 품질·보안·Release 경계

개발 시작 이후 Worker가 독립적으로 테스트와 보안 도구를 다시 실행한다. Codex의 완료
주장만 신뢰하지 않는다.

기본 Release 차단 조건:

- 실패한 테스트가 하나라도 있음
- Acceptance Criteria 미충족
- Security Scan 실패
- 미해결 CRITICAL 또는 유효한 위험 수용이 없는 HIGH Finding
- SBOM 생성 실패
- Android 빌드 실패
- Commit SHA 또는 PRD hash 불일치
- Build Artifact SHA-256 불일치

CRITICAL 위험 수용은 거부한다. Codex Worker에는 실제 Android signing key를 제공하지
않는다. 현재 Signing Worker는 비활성 Stub이므로 최종 배포 서명은 별도 구현 전까지
완료되지 않는다.

## 7. 데이터와 Secret 원칙

- PostgreSQL: 프로젝트, 버전, 상태, 작업, 감사와 보고서 Metadata
- Redis/BullMQ: 비동기 작업과 취소/재시도/DLQ
- MinIO/S3: PRD, 디자인, 보고서, SBOM, APK/AAB와 source snapshot
- DB 시간: UTC, UI 표시: `Asia/Seoul`
- 중요 version entity는 덮어쓰지 않고 새 버전을 만든다.
- Artifact에는 객체 키, MIME, 크기, SHA-256과 생성자를 기록한다.
- `.env`, PAT, private key, Tunnel credential JSON, Codex `auth.json`, signing key는
  Commit·로그·대화에 넣지 않는다.

기존 운영 데이터를 macOS로 옮길 때 PostgreSQL·MinIO backup/restore와 기존
`AUDIT_HASH_PEPPER`를 보존한다. Docker 이미지나 Git clone만으로 운영 데이터가
이전되지는 않는다.

## 8. 현재 운영 전환 기준

운영 목표는 macOS Docker Desktop이다.

- Core: `docker-compose.prod.yml`
- Real Worker: 같은 파일의 `worker` profile
- Worker platform: 기본 `linux/amd64`
- Gateway: Mac loopback `127.0.0.1:8080`
- Factory Tunnel: 기존 `Sandeul_tunnel_v1`을 재사용
- Tunnel Docker 실행: `infra/cloudflared/docker-compose.yml`
- Tunnel credential: Repository 밖의 `~/.cloudflared/factory/`에 보관

Windows와 Mac이 서로 다른 DB/MinIO를 가리키는 상태에서 같은 Tunnel replica를 오래
동시에 실행하지 않는다. Mac Core와 데이터 복구를 검증한 뒤 Mac connector를 올리고,
공개 URL을 확인한 다음 Windows의 `factory-tunnel` connector만 내린다. Cloudflare의
Tunnel 객체와 DNS, 별도 `guild-event-tunnel`은 삭제하지 않는다.

## 9. 새 세션 시작 절차

새 Codex 세션은 다음 순서로 시작한다.

1. Repository root의 `AGENTS.md`와 이 문서를 전체 읽는다.
2. `git status --short`, `git branch --show-current`, `git remote -v`를 확인한다.
3. 미커밋 변경이 있으면 사용자 작업으로 간주하고 보존한다.
4. 요청에 맞는 아래 전문 문서만 추가로 읽는다.
5. 실제 코드와 운영 상태를 읽기 전용으로 확인하고 가정을 분리한다.
6. 변경 요청이면 구현·관련 테스트·문서 갱신·Secret scan까지 완료한다.
7. 원격 삭제, Tunnel/DNS 변경, Secret 회전, 서명, merge 같은 고위험 작업은 명시적
   범위와 정확한 대상을 다시 확인한다.

새 세션에 사용할 시작 문구:

```text
먼저 Repository root의 AGENTS.md와 docs/project-context.md를 전체 읽어라.
현재 브랜치와 Git 상태를 확인하고 기존 변경을 보존하라. 이 프로젝트는 Sandeul App
Factory v2이며, 잠긴 PRD와 CEO 지시 범위 밖으로 제품 요구사항을 변경하지 마라.
그 다음 내가 요청한 작업에 필요한 전문 문서를 선택해서 읽고 진행하라.
```

## 10. 작업별 필수 참조 문서

| 작업                   | 먼저 읽을 문서                                               |
| ---------------------- | ------------------------------------------------------------ |
| 전체 Architecture      | `docs/architecture/overview.md`                              |
| GitHub·Codex Worker    | `docs/architecture/github-codex-execution.md`                |
| 테스트·보안·빌드·Gate  | `docs/architecture/quality-release.md`                       |
| CEO Web 사용 흐름      | `docs/operations/factory-user-guide.md`                      |
| macOS Docker 이전/운영 | `docs/operations/macos-docker.md`                            |
| 운영 배포              | `docs/operations/deployment.md`                              |
| Cloudflare Tunnel      | `docs/operations/cloudflare.md`                              |
| `.env`와 Secret        | `docs/operations/secrets.md`                                 |
| 백업·복구              | `docs/operations/backup-restore.md`                          |
| Worker 장애 대응       | `docs/operations/codex-worker.md`                            |
| 위협 모델              | `docs/security/threat-model.md`                              |
| Android 보안           | `docs/security/android-security-policy.md`                   |
| Scanner 도구           | `docs/security/scanner-toolchain.md`                         |
| MCP                    | `docs/api/mcp.md`                                            |
| PRD 작성               | `docs/templates/android-build-ready-prd.md`와 `schemas/prd/` |

## 11. 검증 명령과 완료 조건

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm security:baseline
```

변경 범위와 위험에 비례해 검증하되, 관련 테스트 실패를 숨긴 채 다음 단계로 넘어가지
않는다. 운영 Compose 변경은 `docker compose ... config --quiet`와 health check를,
Worker 변경은 Fake Adapter E2E와 Real Adapter 경계 검증을 포함한다.

완료 보고에는 구현 요약, 변경 파일, 실행 방법, 환경변수, 외부 설정, 테스트·보안 결과,
제한사항, 현재 branch와 commit, 남은 위험을 포함한다.
