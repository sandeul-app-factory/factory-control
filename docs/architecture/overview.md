# Sandeul App Factory v2 Architecture

## 목적

Sandeul App Factory v2는 Android 앱 제작 과정의 중앙 Control Plane이다. 사용자는
ChatGPT Plus에서 가이드와 JSON Schema를 첨부해 PRD를 완성하고 최종 파일을 Factory
웹에 직접 업로드한다. CEO는 Factory에서 서버 검증 결과, 승인·잠금·개발 시작을
통제한다. Factory 백엔드는 OpenAI API를 호출하지 않는다.

## 시스템 경계

```text
CEO Browser
  │ HTTPS / Secure session / CSRF
  ▼
Next.js Web ───── REST + SSE ───── NestJS API
                                      │
                     ┌────────────────┼─────────────────┐
                     ▼                ▼                 ▼
                 PostgreSQL        Redis/BullMQ     S3/MinIO
                  metadata          job state        artifacts
                     │                │
                     │                ▼
                     │          Host Codex Worker
                     │                │
                     │        isolated workspace
                     │                │
                     └──────────── GitHub Adapter ───── GitHub
                                      │
                              Signing Worker Stub
```

## Monorepo 경계

- `apps/web`: 한국어 CEO Control Center. 인증 화면, 프로젝트/PRD/Task/검토 UI.
- `apps/api`: 권한, 입력 검증, 상태 전환, 감사, REST/OpenAPI, SSE, MCP endpoint.
- `apps/worker`: BullMQ 소비자. Repository workspace와 Codex CLI를 격리하고 독립
  테스트·보안검사·SBOM·APK/AAB·Release Gate를 연속 실행.
- `packages/contracts`: API DTO, enum, Zod schema, 상태 머신의 단일 정의.
- `packages/database`: Prisma schema/client, seed 및 관리자 CLI.
- `packages/ui`: 접근성 높은 공통 UI primitive.
- `packages/github`: GitHub App/PAT Adapter 및 Fake Adapter.
- `packages/codex`: prompt builder, Fake/Real Codex Adapter, 결과 schema.
- `packages/storage`: S3/MinIO 객체 저장과 파일 검증.
- `packages/security`: release gate, webhook/CSRF/hash/redaction 정책.

`apps`는 다른 `apps`의 내부 코드를 import하지 않는다. 모든 공유 계약은 `packages`를
통한다. GitHub, Codex, Storage는 interface 뒤에 숨겨 CI의 Fake와 운영의 Real 구현을
명확히 분리한다.

## 데이터 원칙

- GitHub가 소스코드의 유일한 원본이다.
- Factory DB는 관계형 metadata와 감사/의사결정 이력을 저장한다.
- 원본 파일과 보고서/빌드/SBOM/snapshot은 Object Storage에 저장한다.
- 모든 blob은 SHA-256, MIME type, 크기, 객체 key, 생성자를 기록한다.
- DB 시간은 UTC, UI 표시는 `Asia/Seoul`이다.
- PRD, CEO Constraint, Decision Record, Task Instruction은 immutable version이다.
- 잠긴 PRD는 직접 수정하지 않고 새 버전과 새 승인을 요구한다.
- 감사 로그는 UI/API에서 update/delete endpoint를 제공하지 않는다.

## 신뢰 경계

1. Browser 입력은 모두 비신뢰 데이터다.
2. API가 인증, RBAC, CSRF, Zod 검증과 상태 전환을 최종 판단한다.
3. Queue payload는 ID만 운반하고 Worker가 API/DB에서 권위 있는 snapshot을 다시 읽는다.
4. 사용자 지시는 shell 문자열이 아니라 Codex prompt data다.
5. Worker command는 고정 executable과 allowlist된 argument만 사용한다.
6. Signing Worker만 실제 signing key를 볼 수 있으며 Codex Worker에는 절대 전달하지 않는다.
7. GitHub Webhook은 signature와 delivery ID를 검증한 후 처리한다.

## 배포 경계

- 개발: 기본 `docker-compose.yml`에서 Web, API, PostgreSQL, Redis, MinIO 실행.
- Fake E2E: 명시적인 `fake-worker` Compose profile에서만 Fake Worker 실행.
- 운영: `docker-compose.prod.yml`에서 상태 저장 서비스와 Web/API 실행.
- Codex Worker: 전용 OS 사용자와 `/srv/factory-workspaces`를 사용하는 systemd 서비스.
- Cloudflare Tunnel: `infra/cloudflared/config.yaml.example`에서
  `factory.sandeul.work`를 Web으로 전달한다. 기존 tunnel ID와 credential은 덮어쓰지
  않는다.

## 중요한 설계 결정

- Backend의 OpenAI API 호출은 구현하지 않는다.
- 수동 PRD 업로드가 기본이며 업로드는 서버 검증 후 CEO 검토 대기로 제출된다.
- MCP는 `MCP_ENABLED=false`가 기본이고, 활성화해도 `MCP_WRITE_ENABLED=false`이면
  read-only Tool만 노출한다.
- MCP write는 향후 Business/Enterprise 자동화용 선택 기능이며 수동 경로를 우회해
  승인·잠금·개발을 시작할 수 없다.
- 자동 PR merge는 구현하지 않는다.
- 동시 Codex 실행 기본값은 1이다.
- CRITICAL/HIGH finding, 테스트/빌드/SBOM 실패는 release를 차단한다.
- Critical risk acceptance는 서버에서 거부한다.
- 실제 signing은 MVP에서 interface와 disabled stub까지만 제공한다.
