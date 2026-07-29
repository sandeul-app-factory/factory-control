# Secret 설정

## 저장 원칙

- 실제 값은 Repository, `.env.example`, build log, 감사 로그에 넣지 않는다.
- 운영 값은 root 전용 `/etc/sandeul-factory/factory.env` 또는 조직의 Secret Manager에
  둔다.
- GitHub App private key는 base64 전달 대신 향후 파일/Secret Manager mount로
  교체할 수 있다. 현재 값은 출력·조회하지 않는다.
- Codex Worker에 Android keystore, signing password, GitHub 조직 전체 관리 권한을
  주지 않는다.
- `MCP_TOKEN_PEPPER`, session/audit pepper, DB/Redis/MinIO 비밀번호는 서로 다른
  무작위 값이어야 한다.

## 필수 운영 값

| 범주          | 변수                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| PostgreSQL    | `POSTGRES_PASSWORD`                                                                             |
| Redis         | `REDIS_PASSWORD`                                                                                |
| 감사          | `AUDIT_HASH_PEPPER`                                                                             |
| MinIO/S3      | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                                      |
| GitHub App    | `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET` |
| MCP 활성화 시 | `MCP_TOKEN_PEPPER`                                                                              |

PAT fallback은 `GITHUB_FINE_GRAINED_PAT`만 사용하며 대상 조직/Repository와 필요한
권한만 부여한다. GitHub App이 구성되면 PAT를 비워 둔다.

## 생성과 회전

Secret 값은 CSPRNG 또는 Secret Manager로 생성한다. 회전 순서는 새 값 배포, 연결
검증, 구 값 폐기, 감사 기록이다. 기존 GitHub Secret 또는 Cloudflare credential을
Factory 배포가 자동 삭제하지 않는다.

MCP credential token은 설정 화면 또는 CLI에서 한 번만 표시된다. DB에는
`SHA-256(pepper:token)`만 저장하고, token은 외부 Secret 저장소에 둔다.

```bash
export ADMIN_LOGIN_ID=existing-ceo
export MCP_CREDENTIAL_NAME=chatgpt-prd
export MCP_CREDENTIAL_SCOPES=factory.get_prd_schema,factory.list_projects,factory.get_project,factory.get_project_status,factory.create_project,factory.upload_prd,factory.create_prd_version,factory.request_prd_review
export MCP_CREDENTIAL_RATE_LIMIT=30
pnpm mcp:create-credential
unset MCP_CREDENTIAL_NAME MCP_CREDENTIAL_SCOPES MCP_CREDENTIAL_RATE_LIMIT
```

노출 의심 시 설정 화면에서 credential을 즉시 revoke하고, 필요한 경우
`MCP_TOKEN_PEPPER`를 회전해 모든 기존 token을 무효화한다.
