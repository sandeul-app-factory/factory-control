# 운영 배포

## 전제

- 64-bit Linux 서버, Docker Engine/Compose, Git, systemd
- 기존 `factory.sandeul.work` DNS/Cloudflare Tunnel 정보
- 기존 GitHub 조직과 설치된 GitHub App 또는 제한된 fine-grained PAT
- 전용 설치 경로 `/opt/sandeul-app-factory`
- 전용 Worker 사용자 `factory-codex`

이 절차는 기존 원격 저장소, 기본 브랜치, 앱 Repository, DNS, Tunnel, GitHub Secret을
삭제·재생성하지 않는다.

## 설치와 기동

```bash
sudo install -d -o root -g root -m 0755 /opt/sandeul-app-factory
sudo install -d -o root -g root -m 0750 /etc/sandeul-factory
sudo install -d -o root -g root -m 0700 /srv/backups/sandeul-factory

git clone YOUR_EXISTING_REMOTE_URL /opt/sandeul-app-factory
cd /opt/sandeul-app-factory
git switch rebuild/factory-v2
sudo install -o root -g root -m 0600 .env.production /etc/sandeul-factory/factory.env

docker compose \
  --env-file /etc/sandeul-factory/factory.env \
  -f docker-compose.prod.yml \
  config
docker compose \
  --env-file /etc/sandeul-factory/factory.env \
  -f docker-compose.prod.yml \
  up -d --build
```

`.env.production`은 저장소에서 만들지 않는다. 운영 Secret 파일은
`/etc/sandeul-factory/factory.env`에만 두고 `0600`으로 제한한다.

## 관리자 생성

운영 shell history에 비밀번호가 남지 않도록 대화형 `read`로 준비한다.

```bash
read -r -p "Login ID: " ADMIN_LOGIN_ID
read -r -p "Email: " ADMIN_EMAIL
read -r -s -p "Password: " ADMIN_PASSWORD
export ADMIN_LOGIN_ID ADMIN_EMAIL ADMIN_PASSWORD

docker compose \
  --env-file /etc/sandeul-factory/factory.env \
  -f docker-compose.prod.yml \
  run --rm migrate node dist/cli/create-admin.js

unset ADMIN_LOGIN_ID ADMIN_EMAIL ADMIN_PASSWORD
```

## 배포 검증

```bash
docker compose \
  --env-file /etc/sandeul-factory/factory.env \
  -f docker-compose.prod.yml ps
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/api/health
```

브라우저에서는 `https://factory.sandeul.work` 로그인, 프로젝트 생성, 파일
업로드/다운로드, 감사 로그를 확인한다. Worker와 Cloudflare는 각각의 runbook으로
설치한다.

번들 MinIO를 사용할 때 `S3_ENDPOINT=http://minio:9000`,
`S3_PUBLIC_ENDPOINT=https://factory.sandeul.work`, `S3_BUCKET=factory-artifacts`를
유지한다. gateway는 이 private bucket의 서명된 경로만 전달하며 MinIO Console은
공개하지 않는다. 다른 S3 공급자를 사용하면 `S3_PUBLIC_ENDPOINT`를 그 공급자의
브라우저 접근 endpoint로 바꾼다.

호스트에서 실행하는 Codex Worker는 `CODEX_HOST_S3_ENDPOINT`로 번들 MinIO에
접속한다. 운영 Compose의 `MINIO_API_PORT`와 `MINIO_CONSOLE_PORT`는
`127.0.0.1`에만 바인딩되므로 외부에 직접 공개되지 않는다.

## 안전한 갱신

1. DB와 Object Storage를 백업하고 복구 테스트 결과를 확인한다.
2. 새 commit SHA를 검토하고 `git fetch` 후 명시적 branch/commit으로 이동한다.
3. `docker compose ... build`와 `config`를 먼저 실행한다.
4. `migrate`가 성공한 뒤 API/Web을 교체한다.
5. health, login, queue, artifact, audit를 smoke test한다.
6. migration은 수정·삭제하지 않고 문제 시 forward-fix를 사용한다.

이미지와 source snapshot에는 배포 commit SHA를 운영 기록으로 남긴다. 자동 merge,
자동 signing, 자동 release는 하지 않는다.
