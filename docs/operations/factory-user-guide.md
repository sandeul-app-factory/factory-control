# Sandeul App Factory CEO 사용설명서

이 문서는 ChatGPT Plus에서 PRD 기획과 수정 작업을 끝낸 뒤 최종 파일을 Factory 웹에
직접 업로드하고, CEO 승인 한 번과 개발 시작 한 번으로 Codex 개발·독립 테스트·
보안검사·SBOM·Android 빌드·Release Candidate 생성까지 진행하는 절차를 설명한다.

## 1. 역할과 승인 경계

- ChatGPT는 PM이다. 시장조사와 제품 판단을 거쳐 PRD를 작성한다.
- Factory 백엔드는 OpenAI API를 호출하지 않는다.
- 사용자는 Factory에서 내려받은 가이드와 Schema를 ChatGPT 프로젝트에 첨부한다.
- 최종 PRD는 사용자가 Factory 웹에 직접 업로드하며 서버가 Schema를 다시 검증한다.
- MCP는 기본 비활성이고, 활성화해도 별도 write flag가 없으면 읽기 Tool만 노출한다.
- CEO만 최종 PRD 승인, 개발 시작, 위험 수용, Release Candidate 승인을 할 수 있다.
- Codex는 잠긴 PRD와 승인 기록을 변경하지 않고 구현만 담당한다.
- GitHub가 소스코드의 유일한 원본이다.
- Factory는 Pull Request를 자동 병합하지 않는다.
- Codex Worker에는 실제 Android signing key가 없다.

## 2. 전체 흐름

```text
ChatGPT PM 조사·PRD 작성
  → 사용자 초안 검토·반려·재기획
  → 최종 prd.json + prd.md 생성
  → Factory 프로젝트 생성/선택
  → 사용자가 최종 prd.json 직접 업로드
  → 서버 Schema 검증
  → CEO 검토 대기
  → CEO 코멘트·제약사항·Decision Record
  → 조건부 승인/수정 요청/반려 또는 최종 승인
  → 최종 승인 시 PRD 자동 잠금
  → GitHub Repository 생성 또는 연결
  → IMPLEMENT_PRD 작업이 DRAFT로 자동 생성
  → CEO가 개발 시작
  → Codex 구현
  → Commit·Branch push·Pull Request 생성
  → 독립 Gradle 테스트·Acceptance Criteria 검증
  → Android·Gitleaks·Semgrep·Trivy·OSV 보안검사
  → SPDX SBOM 생성
  → Debug APK·unsigned AAB 빌드
  → 전용 Emulator APK 설치 Smoke Test
  → Release Gate
  → CANDIDATE 생성
  → CEO Release Candidate 승인
  → 별도 Signing Worker(현재 Stub)
```

“개발 시작”은 위 자동화 전체를 시작한다. 테스트·보안검사·빌드를 사용자가 각각
시작할 필요가 없다. 중간 단계가 실패해도 성공으로 바꾸지 않으며, 실행된 단계의
보고서를 저장한 뒤 Release Gate를 차단한다.

## 3. 사전 준비

### Factory

- Web/API/PostgreSQL/Redis/MinIO가 실행 중이어야 한다.
- CEO 계정으로 로그인할 수 있어야 한다.
- GitHub App 또는 Fine-grained PAT가 설정되어야 한다.
- 실제 작업에는 Windows 또는 Linux 호스트의 Real Codex Worker가 실행 중이어야 한다.

### Windows Real Worker

현재 저장소에서 다음 명령으로 환경만 검사한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1 -CheckOnly
```

실제 Worker를 foreground로 실행한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1
```

개발 중 파일 변경을 감시하려면 `-Watch`를 추가한다. 스크립트는 `.env`를 읽되 Secret을
출력하지 않고 다음을 검증한다.

- Codex CLI와 `CODEX_HOME/auth.json`
- `codex login status`
- Android Studio JBR
- Android SDK와 adb
- 전용 workspace root
- PostgreSQL·Redis·MinIO의 호스트 연결 주소
- 필수 보안 도구 존재 여부

Docker의 Fake Worker는 기본 Compose에서 실행되지 않는다. Fake E2E가 필요할 때만
다음 profile을 사용한다.

```powershell
docker compose --profile fake-worker up -d --build
```

## 4. ChatGPT Plus에서 PRD 만들기

### 작성 자료 내려받기

1. Factory에서 프로젝트를 만든다.
2. 프로젝트의 `PRD` 탭을 연다.
3. `작성 가이드`를 내려받는다.
4. `최신 JSON Schema`를 내려받는다.
5. ChatGPT 프로젝트에 두 파일을 첨부한다.

작성 가이드에는 PM 역할, 조사·질문·반려 절차, 전체 필드 규칙, 담당자 `산들`·`수빈`,
Android·보안·개인정보·테스트·Release Gate와 최종 자체 검증 목록이 들어 있다. JSON
Schema가 실제 서버 검증의 최종 기준이다.

### 기획 요청

```text
첨부한 Sandeul Android App PRD 작성 가이드와 최신 JSON Schema를 기준으로
새 Android 앱을 기획해줘.

먼저 내 아이디어를 구체화하는 데 꼭 필요한 질문만 순서대로 해줘.
시장성, 경쟁 제품, 수익성, 기술 가능성, 운영, 보안, 개인정보, Play Store 위험을
검토하되 확인된 사실과 추정을 구분해줘.

내가 초안을 검토하고 명시적으로 최종본 생성을 요청하기 전에는 prd.json을
확정하지 마. 최종 요청 후에는 Factory Schema를 통과하는 prd.json과 동일 내용의
prd.md를 각각 다운로드 가능한 파일로 제공하고 자체 검증 결과도 보고해줘.
```

초안을 검토하면서 반려·수정·재기획을 반복한다. 최종본 요청 전에는 Factory에 아무것도
업로드할 필요가 없다.

### 최종 파일 제출

1. ChatGPT에서 `prd.json`과 `prd.md`를 내려받는다.
2. 두 파일의 기능 범위, 제외 범위, 개인정보와 Acceptance Criteria가 같은지 확인한다.
3. Factory `PRD` 탭에서 `최종 PRD 제출`을 누른다.
4. `prd.json`을 선택하고 제출한다.
5. 서버는 파일을 Object Storage에 저장하기 전에 JSON Schema를 검증한다.
6. 성공하면 새 immutable PRD version과 SHA-256을 만들고 `IN_REVIEW`로 제출한다.
7. 실패하면 저장하지 않고 누락 필드와 잘못된 참조를 오류로 반환한다. 오류를 ChatGPT에
   전달해 새 최종 파일을 만든다.

JSON을 권장한다. Markdown도 지원하지만 전체 JSON Schema가 아니라 필수 제목, 담당자,
SDK, release debuggable과 사용자가 별도 입력한 Acceptance Criteria를 검증한다.

### MCP의 위치

기본 수동 흐름에는 MCP가 필요 없다. `MCP_ENABLED=false`와
`MCP_WRITE_ENABLED=false`가 기본이다. 운영자가 MCP를 선택적으로 켜더라도 write flag를
켜지 않으면 Schema·프로젝트·Artifact 조회 Tool만 노출한다. 향후 Business/Enterprise
자동화를 다시 사용할 때만 MCP write를 별도로 활성화한다.

## 5. Build-ready PRD 기준

Canonical 형식은 JSON을 권장하며 Markdown도 지원한다.

- JSON Schema: `schemas/prd/android-build-ready-v1.schema.json`
- Markdown Template: `docs/templates/android-build-ready-prd.md`

JSON은 다음 범주를 모두 구조화한다.

- 문서 metadata와 고정 담당자
- 제품 문제, 타깃 사용자, 측정 가능한 목표와 수익모델
- MUST/SHOULD/제외/향후 범위
- 사용자 여정, 화면별 route·상태·오류·접근성
- 기능 요구사항과 Feature/Screen 참조
- 데이터 모델, 보존·삭제·Migration·Offline 정책
- API request/response/error/timeout/retry
- applicationId, SDK, Kotlin, Compose, Architecture, Module
- Permission 요청 시점과 거부 동작
- Secret, TLS, WebView, exported component, backup, debuggable
- 개인정보 동의·보존·삭제
- 디자인 시스템과 누락 Asset 정책
- 로그·Crash·Analytics의 민감정보 제외
- 고정 Gradle 테스트·Lint·빌드 명령
- 테스트 계획과 기기 매트릭스
- Given/When/Then/Verification 형식의 Acceptance Criteria
- Release Gate, 가정, 미결정 사항, 위험과 완화책

서버는 고정 담당자 변경, SDK 기준 미달, dangling ID 참조, 중복 ID, 보안 우회 설정을
거부한다. PDF/DOCX는 원본 Artifact일 뿐 Canonical PRD로 자동 확정하지 않는다.

## 6. CEO 검토와 승인

1. 프로젝트의 `PRD`에서 본문과 SHA-256을 확인한다.
2. 섹션 또는 inline 코멘트를 작성한다.
3. `CEO 제약사항`에 변경 불가능한 제약을 기록한다.
4. `의사결정 기록`에 기능 추가·제외, 우선순위, 수익모델, 기술·보안 판단을 기록한다.
5. 수동 웹 업로드가 성공하면 PRD는 이미 `IN_REVIEW` 상태다.
6. 승인 Modal에서 조건부 승인, 수정 요청, 반려, 보류 또는 최종 승인을 선택한다.

조건부 승인이나 수정 요청 후에는 기존 PRD를 고치지 않고 새 버전을 업로드한다. 최종
승인 시 서버가 승인 기록을 저장하고 곧바로 PRD를 잠근다. 별도의 잠금 버튼을 다시
누르더라도 동일한 잠긴 버전을 반환한다.

잠금 결과에서 다음을 확인한다.

- 상태 `LOCKED`
- PRD version과 SHA-256
- 승인·잠금 사용자와 시간
- CEO Constraint와 Decision Record snapshot
- 포함 Artifact와 제외 범위
- Acceptance Criteria

## 7. Repository 준비와 자동 Task 전달

잠긴 PRD에서 GitHub Repository를 생성하거나 기존 Repository를 연결한다.

새 Repository 생성 시 Factory는 `AGENTS.md`, README, PR template과
`docs/factory` 기준 파일을 초기화한다. 기존 Repository 연결 시 기본 브랜치와 원격
식별자를 GitHub에서 재검증한다.

Repository 상태가 `REPO_READY`가 되면 서버가 다음 작업을 idempotent하게 자동 생성한다.

```text
Type: IMPLEMENT_PRD
Status: DRAFT
Locked PRD: 현재 잠긴 version과 SHA-256
Acceptance Criteria: 잠긴 PRD 기준
Target branch: Repository 기본 branch
```

이 시점에는 CodexRun이나 Queue Job이 생성되지 않는다. PRD가 개발 조직에 전달됐지만
CEO가 실행을 승인하지 않은 상태다.

## 8. 개발 시작

1. 프로젝트의 `개발 작업`을 연다.
2. 자동 생성된 `DRAFT` 작업을 선택한다.
3. 잠긴 PRD Hash, Task 지시, 대상 Repository를 확인한다.
4. `개발 시작`을 누른다.

서버는 동시에 두 번 시작하는 요청을 원자적으로 차단한다. 성공하면 다음이 생성된다.

- `CodexRun`
- BullMQ `Job`
- 첫 `run.queued` 이벤트
- `CODEX_TASK_START` 감사 로그
- 프로젝트 상태 `DEVELOPMENT_QUEUED`

Worker 기본 동시 실행 수는 1이다.

## 9. Codex와 자동 품질 파이프라인

### Codex 개발

Worker는 새 clone/workspace에서 대상 Commit, 잠긴 PRD Hash, 최신
TaskInstructionVersion, `AGENTS.md`, allowed/denied path를 검증한다. Codex는
`workspace-write` sandbox와 JSON 결과 Schema로 실행한다.

Codex 완료 JSON은 변경 파일, 자체 실행 테스트, 가정·질문·미완료 항목뿐 아니라 각
Acceptance Criteria의 정확한 문자열, 상태, 검증 증거를 포함해야 한다. 기준이
누락되거나 `NOT_VERIFIED`이면 최종 Test Run은 실패다.

### 독립 테스트

Codex 완료 후 Worker가 Codex의 자체 보고와 별개로 다음 고정 Gradle Task를 실행한다.

```text
./gradlew test
./gradlew lint
./gradlew detekt
./gradlew ktlintCheck
```

Windows에서는 `.bat`를 Shell로 실행하지 않는다. `JAVA_HOME/bin/java`와
`gradle-wrapper.jar`를 직접 실행해 command injection 경계를 유지한다.

### 보안검사와 SBOM

다음을 자동 실행한다.

- Factory Android Manifest/Source baseline
- Gitleaks
- Semgrep
- Trivy filesystem
- OSV-Scanner
- Syft SPDX JSON SBOM
- MobSF 설정 상태 기록

도구가 없거나 실행 오류가 나면 HIGH Finding과 실패 Step을 기록한다. CRITICAL/HIGH가
하나라도 열려 있거나 SBOM이 없으면 Release Gate가 차단된다. MobSF Endpoint가 없으면
현재는 INFO로 기록한다.

### 빌드와 설치 Smoke Test

Worker가 다음을 실행하고 산출물을 MinIO/S3에 업로드한다.

```text
./gradlew assembleDebug
./gradlew bundleRelease
```

- AAB가 있으면 unsigned release AAB를 우선 Build Artifact로 등록한다.
- AAB가 없으면 debug APK를 등록한다.
- SHA-256을 업로드 전후 재검증한다.
- signing key에는 접근하지 않는다.
- `ANDROID_SMOKE_TEST_SERIAL`이 지정된 전용 Emulator에 debug APK를 설치한다.
- Emulator serial이 없거나 설치 실패 시 Test Run이 실패하고 Gate가 차단된다.

### Release Gate

모든 결과는 같은 Commit SHA와 잠긴 PRD Hash로 묶인다. Gate는 다음을 확인한다.

- 독립 Test Run 성공
- 모든 Acceptance Criteria 증거 통과
- Security Scan 성공
- CRITICAL 0, 미수용 HIGH 0
- SPDX SBOM 존재
- Build 성공
- Artifact 존재와 SHA-256 일치
- Test/Security/Build Commit SHA 일치

통과하면 Release가 `CANDIDATE`, 프로젝트가 `RELEASE_CANDIDATE`가 된다. 실패하면
Release가 `GATE_BLOCKED`이며 프로젝트는 마지막 정상 검토 단계에 머문다.

## 10. 실행 중 확인과 취소

Task 상세의 `실행 로그`는 SSE로 다음 이벤트를 표시한다.

- workspace와 Codex 시작
- Codex JSONL event
- 독립 test step
- security step
- build step
- PR 생성
- Release Gate 통과 또는 차단

`QUEUED` 또는 `RUNNING` 작업은 `작업 중단`으로 취소할 수 있다. Worker가 실제 프로세스
종료를 확인한 뒤 `CANCELLED`로 기록한다.

## 11. 코드와 결과 검토

### 코드 변경

- Git diff와 변경 이유
- Commit SHA
- 작업 Branch
- Pull Request URL
- 관련 없는 Refactor 또는 금지 경로 변경
- Secret, signing key, `.env` 포함 여부

자동 병합은 없다. 수정이 필요하면 후속 지시 또는 `FIX_REVIEW`, `FIX_TEST`,
`FIX_SECURITY` 작업을 사용한다. 기존 지시는 덮어쓰지 않고 새 버전으로 남는다.

### 테스트

- Test Run 상태와 Commit SHA
- 각 Gradle Step의 명령, 실행시간, 오류
- Acceptance Criteria 상태와 증거
- APK 설치 Smoke Test
- Test Report Artifact

### 보안

- Scanner별 성공/실패
- Finding severity, rule, 설명, 수정 방법
- SBOM과 Security Report Artifact
- MobSF 설정 상태

CRITICAL은 위험 수용할 수 없다. HIGH는 구체적인 사유가 있는 CEO/보안검토자의 위험
수용만 허용하지만 수정을 우선한다.

### 빌드와 파일

- Build type과 미서명 표시
- APK/AAB SHA-256
- `08 Builds`의 Artifact
- Test/Security report와 SBOM

## 12. Release Candidate 승인

1. `빌드`에서 자동 생성된 Release를 선택한다.
2. 상태가 `CANDIDATE`인지 확인한다.
3. Gate report의 모든 check가 true인지 확인한다.
4. APK/AAB를 내려받아 SHA-256과 미서명 상태를 확인한다.
5. 최종 승인 사유를 입력한다.
6. `Release Candidate 승인`을 누른다.

승인 후 Release는 `APPROVED`, 프로젝트는 `FINAL_APPROVAL`이다. 실제 서명은 별도
Signing Worker가 승인 Commit, PRD Hash, Test Run, Security Scan, Build Hash를 다시
검증한 뒤 수행해야 한다. 현재 Stub은 `NOT_CONFIGURED`를 반환한다.

## 13. 실패와 재작업

| 실패                                | 처리                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| PRD Schema 검증 실패                | 오류와 최신 Schema를 ChatGPT에 전달해 새 최종 파일 생성 |
| Codex `BLOCKED`/`FAILED`            | 질문·가정을 검토하고 후속 지시                          |
| Gradle test/lint/detekt/ktlint 실패 | `FIX_TEST` 작업                                         |
| CRITICAL/HIGH Finding               | `FIX_SECURITY` 작업                                     |
| Scanner 또는 Syft 미설치            | Worker 도구 설치 후 재작업                              |
| APK/AAB 빌드 실패                   | Gradle 로그를 기준으로 수정                             |
| Emulator 미설정 또는 APK 설치 실패  | 전용 Emulator와 `ANDROID_SMOKE_TEST_SERIAL` 설정        |
| Acceptance Criteria 증거 누락       | 구현·테스트 보완 후 새 Codex Run                        |
| GitHub push/PR 실패                 | GitHub 권한·네트워크 확인 후 재시도                     |
| Object Storage 실패                 | MinIO/S3 상태를 복구하고 같은 Job 재시도                |
| Gate 차단                           | 실패 기록을 수정하지 말고 새 Commit과 새 품질 기록 생성 |

## 14. 운영 체크리스트

- [ ] Factory에서 최신 작성 가이드와 JSON Schema 다운로드
- [ ] ChatGPT 프로젝트에 두 파일을 첨부하고 최종본 자체 검증
- [ ] 사용자가 최종 `prd.json` 직접 업로드
- [ ] 담당자 `산들`, `수빈`
- [ ] PRD 최종 승인과 자동 `LOCKED`
- [ ] Repository `REPO_READY`
- [ ] 자동 `IMPLEMENT_PRD` Task `DRAFT`
- [ ] CEO가 `개발 시작`
- [ ] Codex Adapter `real`
- [ ] Commit·Branch·PR 확인
- [ ] 독립 Test Run `PASSED`
- [ ] Acceptance Criteria 전부 증거 있음
- [ ] Security Scan `PASSED`
- [ ] CRITICAL 0, 미수용 HIGH 0
- [ ] SPDX SBOM 존재
- [ ] APK 설치 Smoke Test 통과
- [ ] Build `SUCCEEDED`
- [ ] APK/AAB Hash 확인
- [ ] Release `CANDIDATE`
- [ ] CEO 최종 승인 사유 기록
- [ ] 실제 signing 전 미서명 상태 확인
- [ ] 감사 로그 확인
