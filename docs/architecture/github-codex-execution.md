# GitHub and Codex Execution Boundary

## Control flow

```text
CEO Web
  -> authenticated API mutation
  -> immutable DevelopmentTask + TaskInstructionVersion
  -> DB Job + BullMQ job (idempotency key)
  -> dedicated Codex Worker (default concurrency 1)
  -> locked PRD hash and target commit validation
  -> isolated workspace
  -> FakeCodexAdapter or RealCodexAdapter
  -> changed-path policy and Git diff collection
  -> Worker-owned commit/push
  -> GitHub Pull Request (never auto-merged)
  -> API/UI SSE event stream
```

The Worker rereads all authoritative records by UUID. Queue payloads contain identifiers only and
are not treated as product requirements.

## GitHub adapters

- `fake`: local deterministic Repository/PR behavior for CI and E2E.
- `github-app`: preferred. The adapter creates a short-lived installation token from the App
  credentials.
- `fine-grained-pat`: optional compatibility adapter. The token must be scoped to the intended
  repositories only.

The API owns organization/repository discovery, Repository creation, Factory bootstrap files, and
Webhook processing. Webhook signatures are checked against the exact raw request body, and delivery
IDs are unique in PostgreSQL. Automatic merge is intentionally absent.

## Worker credential separation

GitHub credentials remain in the Worker process. The Worker uses them only for fixed clone/push/API
operations. The Codex child process receives an explicit environment allowlist that excludes all
`GITHUB_*` variables. Its `HOME`/`USERPROFILE` points at the isolated task workspace so it cannot
inherit host Git credential helpers. OpenAI/Codex authentication is supplied separately through the
dedicated OS user's Codex configuration or the explicitly configured Codex credential.

User instructions are sent only through Codex stdin. They are never passed to a shell. Git is
invoked with `shell: false`, a fixed subcommand allowlist, validated Git refs, and a
`github.com`-only HTTPS clone URL.

## Workspace and cancellation

Workspace paths have the form:

```text
{CODEX_WORKSPACE_ROOT}/{projectId}/{taskId}/{codexRunId}/
```

All path components are server-generated UUIDs and the resolved path must remain below the
configured root. Cancellation sets durable DB state; the Worker polls it and aborts the Codex child
process. A timed-out or exhausted job is not reported as successful. BullMQ retries use exponential
backoff, while the final failed attempt is marked `DEAD_LETTER`.

## Real Codex CLI

The Real adapter executes the required form:

```bash
codex exec \
  --sandbox workspace-write \
  --json \
  --output-schema /opt/sandeul-factory/schemas/codex/codex-result.schema.json \
  -o /task-output/codex-result.json \
  -
```

`danger-full-access` is rejected. JSONL stdout becomes `CodexRunEvent` records, and the final JSON
must pass both the CLI output schema and the runtime Zod schema.
