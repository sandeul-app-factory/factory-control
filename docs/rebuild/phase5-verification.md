# Phase 5 Verification

검증일은 2026-07-29(Asia/Seoul)이며 임시 Secret과 격리 포트를 사용한
`sandeul-factory-dev` Compose 프로젝트에서 수행했다. 기존 외부 Repository, DNS,
Cloudflare, GitHub Secret과 이 작업 범위 밖의 Docker 프로젝트는 변경하지 않았다.

## 운영 기능

- MCP는 `MCP_ENABLED=false`일 때 `POST /api/mcp`가 404를 반환한다.
- MCP 활성화 검증에서 protocol `2025-11-25`, 허용 도구 11개, 프로젝트 생성,
  scope/rate limit/audit, token 폐기를 확인했다.
- 허용 목록에 없는 `factory.merge_pull_request`는 JSON-RPC `-32602`로 거부됐다.
- 관리자 설정에서 안전한 환경 요약, MCP credential 1회 표시/폐기, 비밀번호 변경,
  전체 세션 종료를 확인했다.
- 개발/운영 Compose가 `config --quiet`를 통과했고 Nginx 설정은 `nginx -t`,
  backup/restore는 `bash -n`을 통과했다.
- `factory.sandeul.work` Cloudflare Tunnel 예제와 host Worker systemd unit을 제공한다.

## Runtime

- Node.js `22.23.1` 기반 Debian 12.15 보안 업데이트를 적용했다.
- API, Web, Worker, Migration 이미지는 production dependency만 포함한다.
- 네 이미지 모두 `uid=1000(node)`으로 실행하며 npm/Corepack을 포함하지 않는다.
- API와 Web health check, DB migration, Redis/MinIO health, Worker queue 시작을 확인했다.
- 기존 root 소유 workspace volume도 복구하도록 1회성 권한 초기화 서비스를 검증했다.
- Worker의 전용 workspace에 `node` 사용자가 디렉터리를 생성하고 정리할 수 있음을
  확인했다.

## Test Gates

- TypeScript strict typecheck: 통과
- ESLint: 통과
- Vitest: 26개 테스트 통과
- Production build: 10개 workspace package 통과
- Prettier check: 통과
- Playwright Chromium: 1개 전체 인수 시나리오 통과, 15.6초
- Compose config와 runtime health: 통과

Playwright 시나리오는 관리자 로그인, 프로젝트 생성, PRD 세 버전, 코멘트,
CEO Constraint, Decision Record, 조건부 승인, 최종 승인/잠금, diff, Fake GitHub
Repository, Fake Codex Worker, JSONL 이벤트, Git diff/PR, 테스트, 보안 Finding, SBOM,
APK, Release Gate, Release Candidate 승인, 실제 Artifact 다운로드와 SHA-256, 감사
로그와 설정 화면을 검증한다.

## Security Gates

- `pnpm audit --audit-level high`: 알려진 취약점 없음
- OSV Scanner `2.3.8`: 알려진 취약점 없음
- Secret baseline: 통과
- Gitleaks `8.30.1`: 누출 없음
- Semgrep `1.150.0`: Factory 6개 정책, Finding 0
- Trivy `0.72.0` source: CRITICAL/HIGH 0, Dockerfile misconfiguration 0
- Trivy `0.72.0` API/Web/Worker/Migration images: 각 CRITICAL/HIGH 0
- Syft `1.44.0`: CycloneDX JSON SBOM 생성, SHA-256
  `b0d1159ad3e92a0eba77a4ecb8429870b8acb467cea58ac62cc9b1b9f099118d`
- dependency license JSON report: 생성

OSV가 발견한 Turbo `2.5.6`과 `file-type` `21.0.0` 취약점은 각각 `2.9.14`,
`21.3.2`로 갱신한 뒤 재검사했다. Trivy가 발견한 개발 dependency와 오래된 OS
패키지의 runtime 포함 문제는 production deploy 분리, npm/Corepack 제거, Node와
Debian 보안 업데이트로 수정한 뒤 재검사했다.

공식 Semgrep `1.164.0`은 이 환경에서 `--oss-only`와 로컬 규칙을 사용해도 RPC
프로세스가 종료되지 않았다. 같은 로컬 규칙을 `1.150.0`으로 실행해 통과했으며,
운영 CI에서 최신 버전 회귀가 해소됐는지 다시 확인해야 한다.

## External Values Not Applied

- 기존 Git 원격 URL
- GitHub App/PAT와 Webhook Secret
- Cloudflare Tunnel ID와 credential JSON
- 운영 DB/Redis/MinIO/감사/MCP Secret
- 실제 Codex CLI 인증
- Android keystore/HSM과 실제 Signing Worker

위 값은 임의 생성하거나 Repository에 저장하지 않았다.
