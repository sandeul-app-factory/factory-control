# Codex Worker 운영

Codex Worker는 API/Web과 분리해 전용 OS 사용자와 workspace에서 실행한다. Android
signing key는 Worker 환경에 두지 않는다.

## Windows 개발 호스트

### 확인된 기본 경로

```dotenv
CODEX_ADAPTER=real
CODEX_BIN=C:/Users/user/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe
CODEX_HOME=C:/Users/user/.codex
CODEX_WORKSPACE_ROOT=C:/Users/user/Desktop/SH/dev/sandeul-app-factory/.factory-workspaces
CODEX_RESULT_SCHEMA_PATH=C:/Users/user/Desktop/SH/dev/sandeul-app-factory/schemas/codex/codex-result.schema.json
JAVA_HOME=C:/Program Files/Android/Android Studio/jbr
ANDROID_HOME=C:/Users/user/AppData/Local/Android/Sdk
GRADLE_USER_HOME=C:/Users/user/Desktop/SH/dev/sandeul-app-factory/.factory-workspaces/.gradle
CODEX_HOST_S3_ENDPOINT=http://127.0.0.1:9000
CODEX_HOST_S3_PUBLIC_ENDPOINT=http://127.0.0.1:9000
```

Android Studio JBR은 Gradle 실행 JDK이고 PRD의 `javaToolchain=17`은 앱 컴파일
toolchain 기준이다. 기본 시스템 Java 26을 Worker 빌드에 사용하지 않는다.

### 환경 검사

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1 -CheckOnly
```

스크립트는 `.env`를 안전하게 읽고 Docker 내부 host name인 `postgres`, `redis`,
`minio`를 loopback port로 변환한다. Secret 값은 출력하지 않는다.

### 실행

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1
```

개발 중 watch:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1 -Watch
```

PowerShell 실행 정책이 `.ps1` 실행을 막는 시스템에서도 위 명령은 해당 프로세스에만
`Bypass`를 적용한다. 시스템 전체 정책을 변경할 필요가 없다.

### 보안 도구

실제 Release Gate에는 다음 실행 파일이 Worker `PATH`에 있어야 한다.

- `gitleaks`
- `semgrep`
- `trivy`
- `osv-scanner`
- `syft`

공식 설치 자료:

- Gitleaks: <https://github.com/gitleaks/gitleaks>
- Semgrep: <https://semgrep.dev/docs/getting-started/>
- Trivy: <https://trivy.dev/latest/getting-started/installation/>
- OSV-Scanner: <https://google.github.io/osv-scanner/installation/>
- Syft: <https://github.com/anchore/syft>

Windows에서 `osv-scanner`는 공식 WinGet package
`winget install Google.OSVScanner`를 지원한다. Semgrep은 공식 문서 기준 Python/pipx
설치를 지원한다. 나머지는 공식 release 또는 Scoop/Chocolatey 설치 후 `*_BIN`
환경변수로 절대 경로를 지정할 수 있다.

도구가 없어도 Worker는 시작하지만 자동 Security Scan에 HIGH Finding을 만들고 Release
Gate를 차단한다.

### Emulator 설치 Smoke Test

Release Gate를 통과하려면 전용 Emulator를 실행하고 serial을 설정한다.

```powershell
adb devices
```

```dotenv
ANDROID_SMOKE_TEST_SERIAL=emulator-5554
```

Worker는 생성된 debug APK를 다음과 같은 고정 인자로 설치한다.

```text
adb -s <serial> install -r <generated-debug-apk>
```

사용자 입력을 Shell command로 실행하지 않는다.

## Linux 운영 호스트

### OS 사용자와 경로

```bash
sudo useradd --system --home-dir /var/lib/factory-codex \
  --create-home --shell /usr/sbin/nologin factory-codex
sudo install -d -o factory-codex -g factory-codex -m 0700 /srv/factory-workspaces
sudo install -d -o root -g root -m 0750 /etc/sandeul-factory
sudo install -o root -g root -m 0600 \
  infra/systemd/worker.env.example /etc/sandeul-factory/worker.env
```

`worker.env`의 빈 Secret은 운영 Secret 저장소에서 채운다. Codex 로그인은
`factory-codex` 사용자로 수행하고 `CODEX_HOME`도 이 사용자가 읽을 수 있는 전용
경로로 둔다.

```bash
sudo -u factory-codex -H codex login
sudo -u factory-codex -H codex login status
```

### 빌드와 systemd

```bash
cd /opt/sandeul-app-factory
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @sandeul/worker... build

sudo install -o root -g root -m 0644 \
  infra/systemd/sandeul-factory-codex-worker.service \
  /etc/systemd/system/sandeul-factory-codex-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now sandeul-factory-codex-worker
```

### 상태 확인

```bash
systemctl status sandeul-factory-codex-worker
journalctl -u sandeul-factory-codex-worker -n 200 --no-pager
```

## 실행 보안

- `CODEX_SANDBOX=workspace-write`만 허용한다.
- 기본 concurrency는 1이다.
- Repository마다 clone/workspace를 분리한다.
- 대상 Commit과 잠긴 PRD Hash를 실행 직전에 검증한다.
- command executable과 argument는 코드의 allowlist로 고정한다.
- Windows Gradle Wrapper는 `cmd.exe`가 아닌 Java main class로 실행한다.
- `.env`, keystore, `google-services.json`은 기본 denied path다.
- 실제 signing key를 환경, prompt, workspace에 넣지 않는다.
- timeout, 취소, retry, DLQ를 구분한다.
- 품질 단계 실패를 성공 상태로 바꾸지 않는다.

## 장애 대응

| 증상                       | 확인                                                         |
| -------------------------- | ------------------------------------------------------------ |
| Task가 `QUEUED`에 머묾     | Worker process, Redis URL, queue name                        |
| Codex 인증 실패            | Worker의 `CODEX_HOME/auth.json`, `codex login status`        |
| clone/push 실패            | GitHub App/PAT 권한, Repository 접근, network                |
| Gradle JDK 오류            | `JAVA_HOME`, Android Studio JBR, Gradle/AGP 호환성           |
| SDK 오류                   | `ANDROID_HOME`, SDK platform/build-tools                     |
| Security Gate 차단         | 누락 scanner, raw report, CRITICAL/HIGH Finding              |
| SBOM Gate 차단             | Syft 설치와 SPDX JSON 출력                                   |
| Smoke Test 차단            | Emulator 실행, adb device 상태, `ANDROID_SMOKE_TEST_SERIAL`  |
| Artifact 저장 실패         | MinIO health, host S3 endpoint, access/secret key            |
| 분석을 위해 workspace 보존 | 일시적으로 `CODEX_WORKSPACE_CLEANUP=false`, 이후 안전한 정리 |

workspace 정리는 결과와 Artifact, Git push/PR 상태가 저장된 뒤 수행한다.
