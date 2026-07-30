# Sandeul App Factory v2

Android 앱 제작 공장의 중앙 Control Plane이다. ChatGPT Plus에서 사용자와 기획을
완성하고 내려받은 Build-ready PRD를 사용자가 Factory 웹에 직접 업로드한다. Factory는
서버 검증·CEO 승인·잠금·개발·테스트·보안·릴리스를 통제한다. Factory 백엔드는
OpenAI API를 호출하지 않는다.

## 구현 범위

- 한국어 CEO Control Center: 프로젝트, PRD 버전·diff·코멘트·승인·잠금, 제약사항,
  Decision Record, 작업 로그, Git diff/PR, 테스트, 보안 Finding, 빌드, 감사 로그, 설정
- NestJS REST/OpenAPI API: Argon2id 인증, opaque session, CSRF, RBAC, 상태 머신,
  optimistic locking, 감사
- PostgreSQL/Prisma metadata, Redis/BullMQ 작업, MinIO/S3 artifact
- GitHub App 우선 Adapter와 fine-grained PAT/Fake Adapter
- Fake/Real Codex Adapter, 별도 Worker, JSONL/SSE, 취소·재시도·DLQ, workspace 격리
- 개발 시작 한 번으로 Codex→독립 테스트→보안검사→SBOM→APK/AAB→Release Gate 실행
- Release Gate, Android 정적 보안 규칙, Signing Worker interface와 비활성 Stub
- 기본 비활성 Streamable HTTP MCP endpoint, 기본 read-only Tool 정책과 선택형 write flag
- 개발/운영 Docker Compose, host Worker systemd, `factory.sandeul.work` cloudflared template

## 빠른 시작

필수 도구는 Docker Engine/Compose와 Git이다. 실제 Secret은 저장소에 기록하지 않는다.

```bash
cp .env.example .env
# .env의 빈 Secret을 안전한 값으로 채운다.
docker compose --env-file .env up -d --build
```

기본 Compose는 Real Codex Worker를 컨테이너에서 실행하지 않는다. Windows 개발
호스트에서는 로그인된 Codex CLI를 다음 스크립트로 실행한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1 -CheckOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1
```

FakeCodexAdapter E2E용 Worker만 필요한 경우:

```bash
docker compose --profile fake-worker up -d --build
```

개발 기본 주소:

- Control Center: `http://localhost:3000`
- OpenAPI: `http://localhost:4000/api/docs`
- MinIO Console: `http://localhost:9001`

PRD 작성 가이드와 최신 JSON Schema는 로그인 후 프로젝트의 `PRD` 화면에서 내려받는다.
ChatGPT 프로젝트에 두 파일을 첨부해 기획을 완료한 뒤 최종 `prd.json`을 직접 제출한다.

관리자 계정은 실행 시점에만 환경변수로 전달한다.

```bash
docker compose --env-file .env run --rm \
  -e ADMIN_LOGIN_ID \
  -e ADMIN_EMAIL \
  -e ADMIN_PASSWORD \
  migrate node dist/cli/create-admin.js
```

비밀번호는 14자 이상이며 영문 대·소문자, 숫자, 특수문자를 포함해야 한다. 생성 후
`http://localhost:3000`에서 로그인한다.

## 개발 명령

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm security:baseline
pnpm security:full
```

호스트에 Node.js가 없으면 `infra/docker/Dockerfile`의 builder target으로 같은 검사를
실행할 수 있다.

## 운영

운영 Compose에는 Web, API, PostgreSQL, Redis, MinIO, migration, loopback Nginx
gateway가 포함된다. Real Codex Worker는 전용 OS 사용자와 systemd로 호스트에서
실행한다. Cloudflare Tunnel은 gateway의 `127.0.0.1:8080`에만 연결한다.

- [운영 배포](docs/operations/deployment.md)
- [CEO 사용설명서](docs/operations/factory-user-guide.md)
- [Secret 설정](docs/operations/secrets.md)
- [Cloudflare 연결](docs/operations/cloudflare.md)
- [Codex Worker](docs/operations/codex-worker.md)
- [백업과 복구](docs/operations/backup-restore.md)
- [MCP endpoint](docs/api/mcp.md)
- [아키텍처](docs/architecture/overview.md)
- [위협 모델](docs/security/threat-model.md)

기존 GitHub 조직·원격 저장소·앱 Repository·DNS·Tunnel·Secret을 자동으로 변경하거나
삭제하지 않는다. 실제 원격 저장소 연결, GitHub App 설치, Cloudflare tunnel ID,
운영 Secret, Signing Worker는 서버 관리자가 명시적으로 설정해야 한다.
