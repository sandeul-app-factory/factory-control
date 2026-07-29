# Factory MCP Endpoint

## 기본 정책

- Endpoint: `POST https://factory.sandeul.work/api/mcp`
- Transport: stateless Streamable HTTP JSON response
- 기본값: `MCP_ENABLED=false`
- 인증: `Authorization: Bearer <one-time-issued-token>`
- Protocol header: `MCP-Protocol-Version: 2025-11-25`
- Origin allowlist, credential scope, 분당 rate limit, request ID, 감사 로그 적용
- 범용 shell/SQL과 삭제·merge·sign·secret 회전 tool은 제공하지 않음

GET SSE stream과 DELETE session은 사용하지 않아 `405`를 반환한다. 서버는
`initialize`, `ping`, `tools/list`, `tools/call`을 지원한다. 2026-07-28 release
candidate의 `server/discover`와 mirrored method/name header도 호환하지만,
기본 negotiation은 stable `2025-11-25`다.

## Credential

CEO 설정 화면에서 이름, 최소 scope, rate limit, 만료일로 생성한다. token은 한 번만
표시되고 DB에는 pepper를 포함한 hash만 저장한다. 운영 연결 전 Secret Manager에
보관한다.

## Tool allowlist

- `factory.list_projects`
- `factory.get_project`
- `factory.get_project_status`
- `factory.list_artifacts`
- `factory.read_artifact`
- `factory.create_project`
- `factory.upload_prd`
- `factory.create_prd_version`
- `factory.record_ceo_constraint`
- `factory.record_decision`
- `factory.request_prd_review`

PRD tool은 Markdown 또는 schema-valid JSON만 canonical 후보로 받으며 최대 크기는
`MCP_MAX_PRD_BYTES`다. 업로드된 PRD는 자동 승인·잠금되지 않는다.

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

고위험 작업은 CEO Control Center의 인증·승인 흐름에서만 수행한다. MCP를 활성화하기
전 read-only credential로 staging smoke test하고 감사 로그를 확인한다.
