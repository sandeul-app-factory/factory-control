# Codex Worker 운영

## 격리

```bash
sudo useradd --system --home-dir /srv/factory-workspaces --shell /usr/sbin/nologin factory-codex
sudo install -d -o factory-codex -g factory-codex -m 0700 /srv/factory-workspaces
sudo install -d -o root -g root -m 0750 /etc/sandeul-factory
sudo install -o root -g root -m 0600 \
  infra/systemd/worker.env.example /etc/sandeul-factory/worker.env
```

`worker.env`의 빈 값은 운영 Secret 저장소에서 채운다. Android signing key는 넣지
않는다. `CODEX_CONCURRENCY=1`, `CODEX_SANDBOX=workspace-write`,
`CODEX_WORKSPACE_ROOT=/srv/factory-workspaces`를 기본으로 유지한다.

## 설치

Node.js 22, pnpm, Git, Codex CLI, Android build toolchain은 서버 정책에 따라 설치한다.
`command -v pnpm`과 `command -v codex` 결과가 service 파일과 `worker.env`의 경로와
일치하는지 확인한다.

```bash
cd /opt/sandeul-app-factory
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @sandeul/database generate
pnpm --filter @sandeul/worker... build

sudo install -o root -g root -m 0644 \
  infra/systemd/sandeul-factory-codex-worker.service \
  /etc/systemd/system/sandeul-factory-codex-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now sandeul-factory-codex-worker
```

## 검증과 장애 대응

```bash
systemctl status sandeul-factory-codex-worker
journalctl -u sandeul-factory-codex-worker -n 200 --no-pager
```

웹에서 Fake Adapter 작업을 먼저 완료한 뒤 Real Adapter로 전환한다. Real 작업은
잠긴 PRD hash, target commit, allow/deny 경로, test allowlist를 검증해야 한다.
취소 시 process group을 종료하고, timeout/retry 후에도 실패하면 DLQ로 보낸다.

workspace 정리는 완료 결과가 API/DB에 저장되고 branch push/PR 상태가 확인된 후에만
수행한다. 장애 분석 중에는 `CODEX_WORKSPACE_CLEANUP=false`로 보존할 수 있지만,
민감정보와 디스크 사용량을 별도로 관리한다.
