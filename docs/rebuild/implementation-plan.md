# Factory v2 Rebuild Plan

## Phase Gate

각 Phase는 typecheck, lint, test, build, 기본 보안 검사, 문서 갱신을 통과한 뒤 독립
커밋한다. 실패가 남아 있으면 다음 Phase로 이동하지 않는다.

## Phase 0 — 분석 및 보존

- 새 저장소 `main`에 legacy inventory 기준점 생성
- `rebuild/factory-v2` 브랜치에서 구현
- Architecture, threat model, 구현 계획 작성

## Phase 1 — 기반 구성

- pnpm/Turbo/TypeScript strict monorepo
- Next.js Web, NestJS API, BullMQ Worker
- Prisma/PostgreSQL, Redis, MinIO
- Argon2id 인증, session, CSRF, RBAC, rate limit, 감사 로그
- 개발/운영 Docker Compose와 `.env.example`

## Phase 2 — 프로젝트와 PRD

- 서버 검증 상태 머신과 전환 history
- artifact upload validation/object metadata
- Markdown/JSON PRD version, diff, section/comment, 승인/잠금
- immutable CEO Constraint와 Decision Record version
- Google Drive/MYBOX 스타일 한국어 CEO Control Center

## Phase 3 — GitHub와 Codex

- GitHub App/PAT/Fake Adapter
- Repository 연결/생성/bootstrap manifest/webhook
- Development Task/Instruction version/BullMQ/idempotency/cancel/DLQ
- Fake/Real Codex Adapter, stdin prompt, JSONL/SSE/result/diff/PR

## Phase 4 — 품질과 Release

- Test/Security/Build/SBOM 모델과 화면
- CRITICAL/HIGH 차단 release gate와 risk acceptance
- Android 검사 policy와 Signing Worker interface/disabled stub
- integration/E2E 시나리오 확장

## Phase 5 — 운영 완성

- 기본 비활성 Streamable HTTP MCP endpoint와 domain tool allowlist
- 관리자 설정, backup/restore/secret/deployment/runbook
- Worker systemd, production compose, cloudflared config template
- 전체 테스트 및 보안 기본 검사

## 외부 설정 대기 항목

- 기존 GitHub 원격 저장소 URL
- GitHub App ID, installation ID, private key 또는 fine-grained PAT
- PostgreSQL/Redis/MinIO production secret
- Cloudflare tunnel ID와 credential file
- 운영 session/CSRF encryption secret
- 향후 Signing Worker와 keystore/HSM

이 값들은 Repository에 저장하지 않으며 문서와 `.env.example`에는 변수명만 제공한다.
