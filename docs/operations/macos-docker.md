# macOS Docker 운영

Factory의 Web, API, PostgreSQL, Redis, MinIO와 Real Codex Worker를 Docker Desktop에서
함께 실행하는 절차다. Apple Silicon에서도 Android SDK와 스캐너의 동일한
실행 환경을 보장하기 위해 Worker는 기본적으로 `linux/amd64`를 사용한다.
최초 이미지 빌드와 Android 빌드는 ARM 네이티브보다 느릴 수 있다.

## 1. 준비

- Docker Desktop for Mac
- Git
- 최소 40GB의 Docker 디스크 여유 공간
- 기존 GitHub App 또는 Fine-grained PAT
- Codex를 사용할 ChatGPT 계정

```bash
git clone https://github.com/sandeul-app-factory/factory-control.git
cd factory-control
cp .env.example .env
```

`.env`에 PostgreSQL, Redis, MinIO, Session, Audit pepper, GitHub 인증 값을 입력한다.
실제 Secret은 Git에 Commit하지 않는다. 승인 없는 PRD 흐름의 기본값은
`APPROVAL_WORKFLOW_ENABLED=false`이다. `PRD_APPROVAL_ENABLED`은 기존 환경의 하위 호환
옵션으로만 유지한다.

macOS 운영 Worker에는 다음 값을 명시한다.

```dotenv
CODEX_ADAPTER=real
GITHUB_ADAPTER=app
FACTORY_WORKER_PLATFORM=linux/amd64
APPROVAL_WORKFLOW_ENABLED=false
```

Fine-grained PAT를 쓰는 경우에만 `GITHUB_ADAPTER=fine-grained-pat`로 바꾼다.

## 2. 이미지 빌드와 Codex 로그인

```bash
docker compose --env-file .env -f docker-compose.prod.yml --profile worker build
docker compose --env-file .env -f docker-compose.prod.yml --profile worker \
  run --rm --no-deps --entrypoint codex worker login --device-auth
docker compose --env-file .env -f docker-compose.prod.yml --profile worker \
  run --rm --no-deps --entrypoint codex worker login status
```

로그인 정보는 `factory_codex_home` Docker volume에 저장되며 Repository에
포함되지 않는다. 로그인이 완료되지 않으면 Worker를 올리지 말고 먼저
`login status`를 확인한다.

## 3. 실행

```bash
docker compose --env-file .env -f docker-compose.prod.yml --profile worker up -d --build
docker compose --env-file .env -f docker-compose.prod.yml --profile worker ps
docker compose --env-file .env -f docker-compose.prod.yml logs --tail 100 worker
```

Worker 컨테이너에는 Codex CLI, Git, JDK 17, Android SDK 36, Semgrep, Gitleaks,
Trivy, OSV Scanner, Syft가 포함된다. Workspace, Gradle cache, Codex 로그인은
각각 별도 Docker volume에 보존된다.

## 4. Cloudflare

기존 Tunnel과 DNS를 재생성하지 않는다. 기존 `config.yaml`에 다음 ingress만
합친 뒤 Tunnel을 재시작한다.

```yaml
ingress:
  - hostname: factory.sandeul.work
    service: http://127.0.0.1:8080
  - service: http_status:404
```

## 5. 운영 주의사항

- Worker 동시성은 기본 `1`로 유지한다.
- Android 에뮬레이터는 컨테이너에 포함하지 않는다. 기본 파이프라인은
  Unit/Lint/정적 보안검사와 APK/AAB 빌드를 수행한다.
- Keystore는 Codex Worker volume에 mount하지 않는다.
- `factory_postgres`, `factory_minio`, `factory_codex_home` volume을 주기적으로
  백업한다.
- 이미지 버전 업데이트 전에 staging에서 Worker 실행과 보안 도구 버전을
  확인한다.
