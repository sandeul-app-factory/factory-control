# Sandeul App Factory v2 Architecture

## 목적

Sandeul App Factory v2는 Android 앱 제작 과정의 중앙 Control Plane이다. 사용자는 ChatGPT에서 완성한 PRD를 직접 업로드하고, Figma에서 내보낸 디자인 산출물을 설명과 함께 등록한다. Factory 백엔드는 OpenAI API를 호출하지 않으며, Codex는 별도 Worker에서 잠긴 PRD와 승인된 입력 범위만 구현한다.

## 시스템 경계

```text
CEO Browser
  → HTTPS / Secure session / CSRF
  → Next.js Web ── REST + SSE ── NestJS API
                                  ├─ PostgreSQL: metadata, state, audit
                                  ├─ Redis/BullMQ: jobs and cancellation
                                  ├─ S3/MinIO: PRD, design, reports, builds
                                  ├─ GitHub Adapter ── GitHub
                                  └─ isolated Codex Worker
                                       └─ Codex → test → security → build → gate
```

## Monorepo 경계

- `apps/web`: 한국어 Control Center. 프로젝트 입력자료와 전역 개발 진행 UI.
- `apps/api`: 인증, RBAC, 검증, 상태 전환, 감사, REST/OpenAPI, SSE, MCP endpoint.
- `apps/worker`: BullMQ 소비자. 격리된 Repository workspace에서 Codex, 독립 테스트, 보안검사, SBOM, Android 빌드와 Release Gate를 연속 실행.
- `packages/contracts`: DTO, enum, Zod Schema와 상태 머신의 단일 정의.
- `packages/database`: Prisma Schema/client, migration, seed와 관리자 CLI.
- `packages/ui`: 접근성 높은 공통 UI primitive.
- `packages/github`: GitHub App/PAT Adapter와 Fake Adapter.
- `packages/codex`: prompt builder, Fake/Real Adapter와 결과 Schema.
- `packages/storage`: S3/MinIO 객체 저장 및 파일 검증.
- `packages/security`: release gate, webhook/CSRF/hash/redaction 정책.

앱끼리 내부 코드를 직접 import하지 않는다. 공유 계약과 Adapter interface는 `packages`를 통해 사용한다.

## 제품 흐름

1. 프로젝트 생성
2. 최종 PRD 업로드, 서버 Schema 검증 및 자동 잠금
3. Figma 디자인 export와 구현 설명 업로드
4. GitHub Repository 생성 또는 연결
5. `IMPLEMENT_PRD` Task 생성과 사용자 시작
6. Codex 구현, Commit, push와 PR 생성
7. 테스트, 보안검사, SBOM, 빌드와 Release Gate
8. Release Candidate 생성

수동 PRD/Release 승인 화면은 기본 비활성화된다. 이 설정은 무결성 검증과 품질 Gate를 제거하지 않는다. PR 자동 병합과 실제 배포 서명도 수행하지 않는다.

## 데이터 원칙

- GitHub가 소스코드의 유일한 원본이다.
- DB에는 관계형 metadata, 상태, immutable version과 감사 이력을 저장한다.
- PRD, 디자인, 보고서, SBOM, 빌드 파일과 snapshot은 Object Storage에 저장한다.
- 모든 blob에 SHA-256, MIME type, 크기, 객체 키와 생성자를 기록한다.
- DB 시간은 UTC, UI 시간은 `Asia/Seoul`이다.
- PRD, CEO Constraint, Decision Record, Task Instruction은 덮어쓰지 않고 새 버전을 만든다.
- 잠긴 PRD는 직접 수정하지 않는다.
- 감사 로그는 UI/API에서 수정하거나 삭제할 수 없다.

## 신뢰 경계

1. Browser 입력은 모두 비신뢰 데이터다.
2. API가 인증, RBAC, CSRF, 요청 Schema와 상태 전환을 최종 검증한다.
3. Queue에는 식별자만 싣고 Worker가 DB/Object Storage에서 권위 있는 snapshot을 다시 읽는다.
4. 사용자 지시는 Codex prompt 데이터이며 Shell 명령으로 직접 실행하지 않는다.
5. Worker는 고정 executable과 allowlist argument만 실행한다.
6. Figma 산출물은 해시 검증 후 `.factory-input/designs`에 배치하고 Git에서 제외한다.
7. Codex Worker에는 실제 signing key와 GitHub 조직 전체 관리 권한을 제공하지 않는다.
8. Webhook은 signature와 delivery ID를 검증한다.
9. raw Codex payload는 저장하되 일반 Web/SSE 응답에는 노출하지 않는다.

## 배포 경계

- 개발: `docker-compose.yml`의 Web, API, PostgreSQL, Redis, MinIO.
- Fake E2E: `fake-worker` profile.
- 운영 Core: `docker-compose.prod.yml`의 Web, API, PostgreSQL, Redis, MinIO, gateway.
- 운영 Worker: 같은 Production Compose의 선택적 `worker` profile 또는 전용 OS 사용자/systemd.
- macOS: Docker Desktop과 `worker` profile로 스캐너·Android SDK·Codex CLI까지 고정 이미지로 실행.
- Cloudflare Tunnel: 기존 tunnel ingress에 `factory.sandeul.work` route를 추가한다.

## 중요한 설계 결정

- Backend는 PRD 생성을 위해 OpenAI API를 호출하지 않는다.
- 기본 수동 업로드 흐름에서 MCP는 필요 없다. `MCP_ENABLED=false`와 `MCP_WRITE_ENABLED=false`가 기본이다.
- 서버 검증을 통과한 Canonical PRD는 기본 설정에서 즉시 잠긴다.
- 자동 PR merge는 없다.
- 동시 Codex 실행 기본값은 1이다.
- CRITICAL/HIGH finding, 테스트·빌드·SBOM 실패는 Release를 차단한다.
- Critical risk acceptance는 서버에서 거부한다.
- 실제 signing은 승인된 Commit/PRD/Test/Security/Build를 재검증하는 별도 Worker 책임이며 MVP는 disabled stub이다.
