# Sandeul App Factory Engineering Instructions

## Session Bootstrap

새 작업 세션은 코드 탐색이나 수정 전에 `docs/project-context.md`를 전체 읽는다. 이 문서는
제품 목적, 현재 사용자 흐름, Repository 구조, 운영 전환 상태와 작업별 문서 경로의
단일 진입점이다. 이후 현재 요청에 필요한 전문 문서만 추가로 읽는다.

문서와 실제 코드 또는 운영 상태가 다르면 읽기 전용 점검으로 사실을 확인하고 차이를
명시한다. 코드 변경으로 동작이 달라지면 `docs/project-context.md`와 관련 전문 문서를
같은 변경에 포함한다.

## Requirement Priority

Factory 개발에서 요구사항 충돌 시 다음 순서를 따른다.

1. 잠긴 PRD
2. CEO Constraint
3. Decision Record
4. 현재 Development Task와 최신 TaskInstructionVersion
5. Acceptance Criteria
6. 이 `AGENTS.md`
7. 기존 코드 규칙

요구사항이 불명확하면 제품 범위를 임의로 변경하지 않는다. 필요한 질문, 사용한 가정,
미완료 항목을 결과 보고서에 명시한다.

## Architecture Boundaries

- `apps/web`는 REST/SSE contract만 사용하며 DB, Redis, GitHub SDK를 직접 import하지 않는다.
- `apps/api`가 인증, 권한, 상태 전환, 감사, idempotency의 최종 판단자다.
- `apps/worker`는 Queue job ID로 권위 있는 snapshot을 다시 읽고 임의 shell을 실행하지 않는다.
- 공유 domain type과 validation은 `packages/contracts`에 둔다.
- Prisma schema/client는 `packages/database`만 소유한다.
- GitHub, Codex, Storage, Signing은 interface 뒤에 두고 Fake/Real 구현을 분리한다.
- GitHub가 source code의 유일한 원본이며 Factory DB에 source 전체를 저장하지 않는다.

## Commands

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

호스트에 Node가 없으면 Repository의 Dockerfile builder target에서 같은 명령을 실행한다.

## Migration Rules

- Prisma schema 변경과 migration SQL을 같은 PR에 포함한다.
- 적용된 migration을 수정하거나 삭제하지 않는다.
- 데이터 손실 가능성이 있는 migration은 expand/migrate/contract 단계로 나눈다.
- Production에서 `prisma db push`를 사용하지 않는다.
- migration 전 backup과 rollback/forward-fix 절차를 문서화한다.

## Security and Secrets

- 실제 Secret, `.env`, GitHub private key, PAT, signing key를 commit하거나 출력하지 않는다.
- Codex Worker는 Android signing key에 접근하지 않는다.
- 사용자 입력을 shell command 또는 argument로 직접 사용하지 않는다.
- command executable과 argument를 allowlist로 검증하고 `shell: false`로 실행한다.
- upload는 크기, magic-byte/MIME, 확장자, path traversal을 검증한다.
- webhook signature는 constant-time 비교하고 delivery ID 중복을 차단한다.
- SSRF 방지를 위해 outbound host와 redirect를 제한한다.
- 테스트/보안 검사를 skip, 삭제, 무력화해서 gate를 통과시키지 않는다.

## API Change Rules

- mutation마다 인증, RBAC, CSRF, Zod/class-validator 검증을 서버에서 수행한다.
- 중요한 mutation에는 request ID와 감사 로그를 남긴다.
- breaking contract 변경은 versioning 또는 migration plan 없이 배포하지 않는다.
- 오류는 성공으로 포장하지 않고 안전한 한국어 메시지와 request ID를 반환한다.
- OpenAPI 문서를 endpoint 변경과 함께 갱신한다.

## Database Schema Rules

- 중요 엔티티는 UUID, UTC timestamp, creator, version, status, soft-delete를 고려한다.
- PRD, CEO Constraint, Decision Record, Task Instruction 이력은 덮어쓰지 않는다.
- optimistic locking이 필요한 update는 expected version을 검사한다.
- 감사 로그 update/delete endpoint를 만들지 않는다.
- object payload는 DB가 아니라 S3 호환 storage에 두고 DB에는 metadata/hash만 둔다.

## Tests

- domain rule은 unit test, Adapter는 contract test, DB/Queue는 integration test를 작성한다.
- 권한, 상태 전환, 감사, upload, webhook은 regression test 없이 변경하지 않는다.
- Codex CLI가 없는 CI는 FakeCodexAdapter를 사용하고 성공을 위조하지 않는다.
- 관련 기존 테스트를 삭제하거나 `.skip`으로 바꾸지 않는다.

## Pull Request Rules

- 하나의 승인된 범위에 집중하고 관련 없는 refactor를 포함하지 않는다.
- 변경 이유, schema/API 변화, 실행한 명령, 결과, 위험과 rollback을 작성한다.
- 자동 merge하지 않는다. CEO 승인 전 merge와 release/signing을 수행하지 않는다.
- lockfile, migration, 문서가 code 변경과 일치해야 한다.

## Definition of Done

- Acceptance Criteria 충족
- Typecheck, lint, unit/integration/E2E, production build 통과
- 기본 security scan과 secret scan 통과
- 실패/미구현/가정을 숨기지 않은 완료 보고서 작성
- 변경 파일과 이유, commit SHA, artifact SHA-256 기록
- 관련 Architecture, API, Operations 문서 갱신
