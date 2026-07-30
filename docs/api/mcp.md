# Factory MCP Endpoint

## 기본 정책

- Endpoint: `POST https://factory.sandeul.work/api/mcp`
- Transport: stateless Streamable HTTP JSON response
- Endpoint 기본값: `MCP_ENABLED=false`
- Write Tool 기본값: `MCP_WRITE_ENABLED=false`
- 인증: `Authorization: Bearer <one-time-issued-token>`
- Protocol header: `MCP-Protocol-Version: 2025-11-25`
- Origin allowlist, credential scope, 분당 rate limit, request ID, 감사 로그 적용
- 범용 Shell/SQL과 삭제·merge·sign·secret 회전 Tool은 제공하지 않음

GET SSE stream과 DELETE session은 사용하지 않아 `405`를 반환한다. 서버는
`initialize`, `ping`, `tools/list`, `tools/call`을 지원한다. 2026-07-28 release
candidate의 `server/discover`와 mirrored method/name header도 호환하지만 기본
negotiation은 stable `2025-11-25`다.

## 수동 PRD 기본 경로

ChatGPT Plus를 사용하는 기본 PRD 흐름에는 MCP가 필요하지 않다.

```text
ChatGPT Plus + 작성 가이드 + 최신 JSON Schema
  → 사용자와 기획·반려·재기획
  → 최종 prd.json 다운로드
  → Factory 웹에 사용자 직접 업로드
  → 서버 Schema 검증
  → CEO 승인·잠금
  → Repository 준비
  → CEO 개발 시작
```

PRD 화면에서 작성 가이드와 최신 Schema를 내려받을 수 있다.

## Credential

MCP를 선택적으로 활성화한 경우 CEO 설정 화면에서 이름, 최소 scope, rate limit,
만료일로 Credential을 생성한다. Token은 한 번만 표시되고 DB에는 pepper를 포함한
hash만 저장한다. 운영 연결 전 Secret Manager에 보관한다.

## 기본 read-only Tool

- `factory.get_prd_schema`
- `factory.list_projects`
- `factory.get_project`
- `factory.get_project_status`
- `factory.list_artifacts`
- `factory.read_artifact`

`factory.get_prd_schema`는 최신 Schema version, JSON Schema, Markdown Template, 고정
담당자 `산들`, `수빈`과 수동 업로드 workflow를 반환한다.

기본 read-only Credential scope:

```dotenv
MCP_CREDENTIAL_SCOPES=factory.get_prd_schema,factory.list_projects,factory.get_project,factory.get_project_status,factory.list_artifacts,factory.read_artifact
```

## 선택형 write Tool

다음 Tool은 `MCP_ENABLED=true`와 `MCP_WRITE_ENABLED=true`를 모두 설정한 경우에만
`tools/list`에 노출되고 호출할 수 있다.

- `factory.create_project`
- `factory.upload_prd`
- `factory.create_prd_version`
- `factory.record_ceo_constraint`
- `factory.record_decision`
- `factory.request_prd_review`

PRD Tool은 Build-ready Markdown 또는 Schema-valid JSON만 canonical 후보로 받으며
최대 크기는 `MCP_MAX_PRD_BYTES`다. Write를 활성화해도 업로드된 PRD는 자동 승인·잠금되지
않고, MCP는 개발 시작 Tool을 제공하지 않는다.

기존 Credential scope는 `.env` 변경으로 갱신되지 않는다. 필요한 경우 새 Credential을
발급하고 연결의 Bearer Token을 교체한다.

## 예시

```bash
curl --fail-with-body https://factory.sandeul.work/api/mcp \
  -H "Authorization: Bearer ${FACTORY_MCP_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-11-25",
      "capabilities":{},
      "clientInfo":{"name":"factory-client","version":"1.0.0"}
    }
  }'
```

고위험 작업은 CEO Control Center의 인증·승인 흐름에서만 수행한다. MCP write를
활성화하더라도 PRD 승인·잠금·개발 시작은 노출되지 않는다. MCP를 활성화하기 전
read-only Credential로 staging smoke test하고 감사 로그를 확인한다.
