# Threat Model

## 보호 자산

- 잠긴 PRD와 승인/제약/의사결정의 무결성
- GitHub source, branch, commit, Pull Request 정보
- 사용자 credential, session, GitHub App key, PAT, object storage credential
- Codex workspace와 실행 prompt/result
- 보안/테스트 보고서, SBOM, APK/AAB
- Release 승인과 향후 Android signing key
- append-only 감사 이력

## 주요 위협과 통제

| 위협                | 공격 경로                             | 통제                                                                         |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| 계정 탈취           | password guessing, session theft      | Argon2id, 로그인 rate limit, HttpOnly/Secure/SameSite cookie, session revoke |
| CSRF                | 인증된 CEO의 mutation 유도            | double-submit token + Origin 검증, SameSite cookie                           |
| 권한 상승           | UI 우회 API 호출                      | API guard의 RBAC, 리소스 단위 검사, 감사 로그                                |
| PRD 변조            | lock 후 직접 수정                     | immutable version, SHA-256, optimistic locking, lock snapshot                |
| 명령 주입           | Task instruction을 shell로 사용       | command/argument allowlist, spawn without shell, prompt stdin                |
| Prompt injection    | PRD/attachment 안의 악성 지시         | 우선순위가 고정된 system rules, 데이터 경계 표기, allowed/denied path        |
| Secret 유출         | 로그, Codex prompt, commit            | redaction, `.env` 금지, Worker env 최소화, signing 분리                      |
| Path traversal      | filename/object key/workspace path    | 서버 생성 UUID key, basename 제거, resolved root 검사                        |
| 악성 업로드         | polyglot, 확장자 위장, oversized file | magic-byte/MIME allowlist, size limit, extension match, SHA-256              |
| SSRF                | webhook/artifact URL, Repository URL  | GitHub API base allowlist, redirect 차단, private-network 차단               |
| Webhook 위조/재전송 | forged signature, duplicate delivery  | HMAC constant-time compare, unique delivery ID                               |
| Queue replay        | 중복 Codex 실행                       | idempotency key unique, atomic status transition, attempts/dead-letter       |
| Supply-chain        | 취약 dependency/image                 | lockfile, audit, OSV, Semgrep, gitleaks, Trivy, SBOM                         |
| Release 우회        | 실패 결과를 성공 처리                 | server-side release gate, immutable run refs, explicit risk acceptance       |
| 감사 삭제           | 관리자 또는 침해자 은폐               | update/delete API 없음, DB privilege 분리 권장, backup/retention             |

## STRIDE 검토

- **Spoofing:** 자체 인증과 선택적 Cloudflare Access를 중첩한다. Access header만으로
  관리자 권한을 부여하지 않는다.
- **Tampering:** version/hash/commit SHA와 상태 전환 history로 탐지한다.
- **Repudiation:** request ID, actor, before/after, 관련 artifact/task/decision을 기록한다.
- **Information disclosure:** 보안 redaction과 다운로드 권한을 적용하고 signed URL 만료를
  짧게 둔다.
- **Denial of service:** 요청/로그인/MCP rate limit, 업로드 크기, Queue concurrency/timeout.
- **Elevation of privilege:** 역할 guard와 고위험 action의 CEO 전용 정책을 적용한다.

## 남은 운영 책임

- TLS 종료, Cloudflare Access policy, firewall, DB/Redis/MinIO network isolation
- GitHub App 최소 권한과 private key rotation
- Backup 암호화, 보관 주기, 복구 훈련
- Signing Worker와 HSM/keystore 실제 구현
- 운영 서버의 OS patch와 Worker 전용 사용자 hardening
