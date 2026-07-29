# Sandeul App Factory CEO 사용설명서

이 문서는 `factory.sandeul.work`에서 프로젝트를 만들고 PRD를 확정한 뒤 Codex로
개발하고, Pull Request·테스트·보안검사·Android 빌드·Release Candidate를 검토하는
전체 절차를 설명한다.

## 1. 먼저 알아야 할 운영 경계

- ChatGPT가 PRD를 작성하고 Factory는 완성된 `.md` 또는 검증 가능한 `.json`을
  업로드받는다. Factory가 OpenAI API로 PRD를 자동 생성하지는 않는다.
- GitHub가 소스코드의 유일한 원본이다. Factory는 PRD, 실행 로그, 보고서, Artifact,
  Commit SHA와 Hash를 관리한다.
- `CODEX_ADAPTER=fake`이면 개발·테스트·PR 결과가 모의 데이터다. 실제 개발에는 API와
  전용 Worker 모두 `CODEX_ADAPTER=real`이어야 한다.
- Production Compose에는 Codex Worker가 포함되지 않는다. Worker는 전용 OS 사용자로
  호스트에서 별도 실행한다.
- Codex가 완료 보고서에 기록한 테스트는 참고 기록이며 Acceptance Criteria를 자동
  충족시키지 않는다. 승인된 CI/Test Adapter가 최종 Test Run을 제출해야 한다.
- Factory는 Pull Request를 자동 병합하지 않는다.
- 실제 Signing Worker는 아직 Stub이다. 현재는 unsigned 또는 debug APK/AAB까지만
  다룬다.

## 2. 전체 흐름

```text
ChatGPT에서 PRD 작성
  → 프로젝트 생성
  → PRD v1 업로드
  → 코멘트·CEO 제약사항·Decision Record
  → 검토 요청
  → 조건부 승인 또는 수정 요청
  → 수정 PRD 새 버전 업로드
  → 최종 승인
  → PRD 잠금
  → GitHub Repository 생성 또는 연결
  → Codex Development Task 생성
  → Worker 실행·로그 확인
  → Git diff·Commit·Pull Request 검토
  → 승인된 Test Run 제출
  → Security Scan·SBOM 제출
  → APK/AAB Build 제출
  → Release Gate
  → Release Candidate 최종 승인
  → Signing Worker 요청(현재 Stub)
```

주요 상태는 다음 순서로 진행된다.

| 단계            | 프로젝트 상태                                     |
| --------------- | ------------------------------------------------- |
| 아이디어 등록   | `IDEA`                                            |
| PRD 작성·수정   | `PRD_DRAFT`, `PRD_REVIEW`, `REVISION_REQUIRED`    |
| PRD 확정        | `PRD_APPROVED`, `PRD_LOCKED`                      |
| Repository 준비 | `REPO_BOOTSTRAPPING`, `REPO_READY`                |
| Codex 개발      | `DEVELOPMENT_QUEUED`, `DEVELOPING`, `CODE_REVIEW` |
| 품질 검증       | `QA_TESTING`, `SECURITY_REVIEW`                   |
| 출시 승인       | `RELEASE_CANDIDATE`, `FINAL_APPROVAL`             |
| 서명·빌드·출시  | `SIGNED`, `BUILT`, `RELEASED`                     |

상태는 서버가 허용된 방향으로만 전환한다. 임의 상태 변경은 할 수 없다.

## 3. 운영 준비 확인

### 3.1 웹과 계정

1. `https://factory.sandeul.work`에 접속한다.
2. 관리자 ID 또는 이메일과 비밀번호로 로그인한다.
3. 대시보드가 열리고 `앱 제작 현황`이 표시되는지 확인한다.

### 3.2 GitHub

다음 중 하나가 설정돼 있어야 한다.

- 권장: GitHub App
- 호환 모드: 조직 범위가 제한된 Fine-grained PAT

Fine-grained PAT를 사용할 때는 `GITHUB_ADAPTER=fine-grained-pat`이어야 한다.
Repository 생성, Contents 쓰기, Pull Request 쓰기, Checks 읽기 권한을 확인한다.

### 3.3 Real Codex Worker

실제 Codex를 사용하기 전 운영자가 다음을 확인한다.

```bash
sudo -u factory-codex codex --version
sudo systemctl status sandeul-factory-codex-worker
journalctl -u sandeul-factory-codex-worker -n 100 --no-pager
```

Worker의 필수 기준:

- `CODEX_ADAPTER=real`
- `CODEX_SANDBOX=workspace-write`
- `CODEX_CONCURRENCY=1`
- Factory PostgreSQL과 Redis에 연결 가능
- GitHub App 또는 Fine-grained PAT 설정 완료
- 전용 OS 사용자로 Codex 인증 완료
- Android SDK, JDK, Gradle 빌드 도구 설치
- 실행 가능한 테스트 명령이 `CODEX_ALLOWED_TEST_COMMANDS`에 등록됨
- Android signing key는 Worker에 없음

자세한 설치 절차는 [Codex Worker 운영](codex-worker.md)을 참고한다.

## 4. 프로젝트 생성

1. 왼쪽 메뉴에서 `대시보드` 또는 `프로젝트`를 연다.
2. `새 프로젝트`를 누른다.
3. 다음 값을 입력한다.

| 필드          | 입력 기준                                      |
| ------------- | ---------------------------------------------- |
| 프로젝트 이름 | 사람이 읽는 앱 이름                            |
| 식별자        | 영문 소문자, 숫자, 하이픈으로 구성한 고유 slug |
| 프로젝트 요약 | 목표 사용자, 핵심 문제, 제품 범위를 짧게 기록  |

4. `프로젝트 생성`을 누른다.
5. 생성된 프로젝트를 열고 초기 상태가 `IDEA`인지 확인한다.

## 5. PRD 준비와 업로드

### 5.1 ChatGPT에서 PRD 작성

PRD에는 최소한 다음 내용이 있어야 한다.

- 제품 목표와 해결할 문제
- 타깃 사용자
- 포함 기능과 제외 기능
- 핵심 사용자 흐름
- 데이터와 개인정보 처리
- Android 권한과 보안 제약
- 수익모델
- 운영·장애 위험
- Acceptance Criteria
- 출시 범위

Canonical PRD는 Markdown 또는 구조화 JSON으로 저장한다.

```markdown
# 앱 이름

## 목표

## 타깃 사용자

## 핵심 기능

## 제외 범위

## 보안 및 개인정보

## Acceptance Criteria
```

PDF와 DOCX는 참고 원본으로 보관할 수 있지만 자동으로 Canonical PRD가 되지는 않는다.

### 5.2 PRD 업로드

1. 프로젝트 내부에서 `PRD`를 연다.
2. `PRD 업로드` 또는 `새 PRD 버전 업로드`를 누른다.
3. `.md` 또는 `.json` 파일을 선택한다.
4. `Acceptance Criteria`에 검증 가능한 기준을 한 줄에 하나씩 입력한다.
5. `제외 범위`에 이번 출시에서 하지 않을 항목을 한 줄에 하나씩 입력한다.
6. `새 버전 업로드`를 누른다.
7. 다음 항목을 확인한다.

- PRD 버전 번호
- 상태 `DRAFT`
- 전체 SHA-256
- Canonical 본문
- Acceptance Criteria

잠긴 PRD는 직접 수정할 수 없다. 수정이 필요하면 항상 새 버전을 올린다.

## 6. PRD 검토와 CEO 의사결정

### 6.1 코멘트

1. `PRD`에서 검토할 버전을 선택한다.
2. `섹션 코멘트`에서 PRD 전체 또는 특정 섹션을 선택한다.
3. 검토 의견을 작성하고 `코멘트 작성`을 누른다.

코멘트에는 모호한 요구사항, 보안 문제, 제외 범위, 측정 불가능한 Acceptance
Criteria를 구체적으로 기록한다.

### 6.2 CEO 제약사항

1. `CEO 제약사항`을 연다.
2. `새 기록`을 누른다.
3. 제목, 상세 내용, 적용 범위, 우선순위, 필수 여부, 사유를 입력한다.

예:

- Codex Worker의 signing key 접근 금지
- 광고 SDK 사용 금지
- 개인정보 서버 저장 금지
- 출시일까지 포함할 기능 제한

기존 기록을 덮어쓰지 않고 새 버전으로 보존한다.

### 6.3 Decision Record

1. `의사결정 기록`을 연다.
2. `새 기록`을 누른다.
3. 액션을 선택하고 상세 근거를 기록한다.

지원 액션:

- 기능 추가 또는 제외
- 우선순위 변경
- 타깃 사용자 변경
- 수익모델 변경
- 기술·보안 제약 추가
- 출시 범위 변경

### 6.4 검토·수정·최종 승인

1. PRD에서 `검토 요청`을 누른다.
2. 상태가 `IN_REVIEW`가 되면 `승인 결정`을 누른다.
3. 다음 중 하나를 선택한다.

| 액션        | 사용 시점                           |
| ----------- | ----------------------------------- |
| 최종 승인   | 수정 없이 개발 기준으로 확정 가능   |
| 조건부 승인 | 명시한 조건을 반영한 새 버전이 필요 |
| 수정 요청   | 요구사항 수정 후 재검토 필요        |
| 반려        | 프로젝트 또는 PRD를 채택하지 않음   |
| 보류        | 결정을 나중으로 미룸                |

4. 조건부 승인 또는 수정 요청이면 PRD를 직접 고치지 말고 새 버전을 업로드한다.
5. 이전 버전과 새 버전의 본문·Hash·Acceptance Criteria를 비교한다.
6. 수정 버전을 다시 `검토 요청`하고 `최종 승인`한다.
7. 상태가 `APPROVED`가 되면 `최종 잠금`을 누른다.
8. `LOCKED`와 잠긴 SHA-256을 확인한다.

잠금 전 체크:

- 모든 필수 CEO Constraint 반영
- Decision Record와 PRD가 충돌하지 않음
- 포함·제외 범위 명확
- Acceptance Criteria가 테스트 가능
- 개인정보와 Android 권한 명시

## 7. GitHub Repository 준비

PRD가 잠기면 `개발 작업` 메뉴에 Repository 설정 화면이 표시된다.

### 7.1 새 Repository 생성

1. `Owner`에 GitHub 조직 이름을 입력한다.
2. Repository 이름과 설명을 입력한다.
3. 필요하면 Template owner와 Template repository를 입력한다.
4. 기본적으로 `Private Repository`를 유지한다.
5. `Repository 생성 요청`을 누른다.

Factory는 Repository를 만들고 `AGENTS.md`, `README.md`, PR template과
`docs/factory` 기준 파일을 초기화한다.

### 7.2 기존 Repository 연결

1. `Owner 조회`에 GitHub 조직 이름을 입력한다.
2. PAT 또는 GitHub App이 볼 수 있는 Repository 목록을 기다린다.
3. 대상 Repository의 `연결`을 누른다.
4. 연결된 Owner/Repository, 기본 Branch, 인증 모드와 CI Check를 확인한다.

기존 앱 Repository의 기본 브랜치나 Secret을 Factory가 임의로 변경하지 않는다.

## 8. Codex 개발 작업 생성

Repository가 `REPO_READY`가 되면 `개발 작업`에서 `새 Codex 작업`을 작성할 수 있다.

### 8.1 Task 유형

| 유형                     | 용도                              |
| ------------------------ | --------------------------------- |
| `PRD 구현`               | 잠긴 PRD의 최초 구현              |
| `기능 추가`              | 승인된 기능 범위 추가             |
| `리뷰 수정`              | 코드 리뷰 의견 반영               |
| `테스트 수정`            | 실패한 테스트 원인 수정           |
| `보안 수정`              | Security Finding 수정             |
| `승인 범위 Refactor`     | 승인된 범위 안의 구조 개선        |
| `Release Candidate 빌드` | 검증된 Commit의 Android 후보 빌드 |
| `문서 생성`              | 승인 범위의 문서 작성             |

### 8.2 Task 입력

1. Task 유형을 선택한다.
2. 작업 제목을 입력한다.
3. `개발 지시`에 구현 범위와 결과물을 작성한다.
4. Acceptance Criteria를 한 줄에 하나씩 입력한다.
5. 대상 Branch를 확인한다.
6. 필요하면 허용 경로와 금지 경로를 한 줄에 하나씩 입력한다.
7. `Codex 작업 생성`을 누른다.

권장 예:

```text
작업 제목:
잠긴 PRD의 로그인 및 온보딩 구현

개발 지시:
잠긴 PRD의 로그인과 최초 온보딩 범위만 구현한다.
관련 없는 화면과 Gradle 구성을 변경하지 않는다.
완료 전 승인된 테스트 명령을 실행하고 미완료 항목을 보고한다.

Acceptance Criteria:
올바른 계정으로 로그인할 수 있다.
잘못된 비밀번호는 오류 메시지를 표시한다.
로그아웃 후 인증 화면으로 이동한다.

허용 경로:
app/**
docs/**

금지 경로:
infra/**
.github/workflows/release.yml
```

`.env`, keystore, `google-services.json` 등 민감 경로는 서버가 자동으로 금지 목록에
추가한다.

## 9. Codex 실행 확인

Task를 선택하면 `실행 로그`에 SSE 이벤트가 실시간 표시된다.

정상 흐름:

```text
QUEUED → STARTING/RUNNING → SUCCEEDED
```

확인 항목:

- Locked PRD SHA-256이 선택한 버전과 같은가
- Adapter가 `real`인가
- Worker가 Repository를 clone하고 대상 Branch/Commit을 검증했는가
- 변경 경로가 허용 범위 안인가
- 승인된 테스트 명령을 실행했는가
- 가정, 질문, 미완료 항목이 완료 보고에 기록됐는가

대기 또는 실행 중인 작업은 `작업 중단`으로 취소 요청할 수 있다. 취소는 즉시 성공으로
처리되지 않으며 Worker가 프로세스를 종료한 뒤 `CANCELLED`로 기록한다.

완료 후 수정이 필요하면 `후속 지시 / 재작업 요청`을 사용한다. 기존 지시는 수정되지
않고 새 `TaskInstructionVersion`과 새 Codex Run이 생성된다.

## 10. 코드 변경과 Pull Request 검토

1. 프로젝트의 `코드 변경`을 연다.
2. 완료된 Task를 선택한다.
3. Git diff, Commit SHA와 PR 링크를 확인한다.
4. 관련 없는 파일, Secret, 테스트 무력화, PRD 범위 확장이 없는지 검토한다.
5. `Pull Request 열기`로 GitHub에서 CI Check와 전체 변경을 검토한다.

Factory는 자동 병합하지 않는다. 수정이 필요하면 Factory에서 `리뷰 수정` Task 또는
후속 지시를 만든다. 승인된 경우에만 GitHub에서 사람이 병합한다.

## 11. 테스트

### 11.1 Codex가 보고한 테스트

Real Codex는 허용된 테스트 명령을 실행하고 완료 JSON에 결과를 기록한다. Worker는
이를 `테스트` 화면에 표시하지만 다음 문구가 붙는다.

```text
Codex 자체 보고 결과이며 Acceptance Criteria 검증을 대체하지 않습니다.
```

이 기록의 `acceptanceCriteriaMet`는 `false`이므로 단독으로 Release Gate를 통과할 수
없다.

### 11.2 승인된 최종 Test Run

승인된 CI/Test Adapter가 Codex가 만든 정확한 Commit SHA에 대해 테스트를 다시 실행한
뒤 구조화된 결과를 제출한다.

필수 확인:

- Commit SHA가 PR, Build, Security Scan과 같음
- 상태 `PASSED`
- 실패 테스트 0
- Acceptance Criteria 충족 `true`
- 실제 실행 명령과 개별 테스트 결과 포함
- 필요하면 Test Report Artifact 연결

현재 웹의 `테스트` 화면은 결과 검토용이다. Test Run 등록은 CI/Test Adapter가
`POST /api/projects/{projectId}/test-runs`로 수행한다. 요청 schema는
`https://factory.sandeul.work/api/docs`에서 확인한다.

테스트가 실패하면:

1. 실패 원인과 Commit SHA를 확인한다.
2. `테스트 수정` Task를 생성한다.
3. 새 PR과 새 Commit을 검토한다.
4. 새 Commit으로 Test Run, Security Scan, Build를 모두 다시 만든다.

## 12. 보안검사와 SBOM

승인된 Scanner Adapter는 Codex/CI Commit에 대해 보안검사를 실행한다.

Android 권장 검사:

- Android Lint, detekt, ktlint
- dependency scan
- gitleaks, Semgrep, Trivy
- Android Manifest와 exported component 검사
- Network Security Config, WebView, debuggable, backup 검사
- MobSF Adapter
- SBOM 생성

Scanner는 다음을 Factory에 제출한다.

- Commit SHA
- Scanner 종류와 성공/실패
- Finding의 severity, rule ID, 설명, 파일/라인, 수정 방법
- SBOM Artifact ID
- 필요하면 Security Report Artifact ID

현재 웹의 `보안` 화면은 결과 검토와 위험 수용을 제공한다. Scan 등록과 SBOM 업로드는
Scanner Adapter가 다음 API로 수행한다.

```text
POST /api/projects/{projectId}/artifacts/SBOM/07%20Security%20Reports
POST /api/projects/{projectId}/security-scans
```

Release 기준:

- CRITICAL 1개 이상이면 차단
- 미해결 HIGH 1개 이상이면 차단
- CRITICAL은 위험 수용 불가
- HIGH 위험 수용은 구체적인 사유와 필요 시 만료일 필수
- SBOM이 없으면 차단

위험 수용보다 수정을 우선한다. 수정 시 `보안 수정` Task를 만들고 새 Commit 기준으로
검사를 다시 실행한다.

## 13. Android 빌드

### 13.1 Codex Build Task

검증된 범위에서 `Release Candidate 빌드` Task를 만들 수 있다. 지시에는 빌드 유형,
대상 Commit, 실행할 Gradle 명령과 산출물 종류를 명시한다.

예:

```text
승인된 Commit으로 unsigned release AAB를 생성한다.
./gradlew bundleRelease와 관련 검증을 실행한다.
signing key에 접근하지 않는다.
산출물 경로와 SHA-256, 실행 결과를 완료 보고에 기록한다.
```

Codex Worker 자체는 APK/AAB를 Factory Object Storage에 자동 등록하지 않는다. 승인된
CI/Build Adapter가 산출물을 업로드하고 Build record를 등록해야 한다.

### 13.2 Artifact와 Build 등록

Build Adapter는 다음 순서로 수행한다.

1. APK 또는 AAB의 SHA-256을 계산한다.
2. Artifact를 `08 Builds`에 업로드한다.
3. 같은 Commit SHA로 Build report를 등록한다.

```text
POST /api/projects/{projectId}/artifacts/APK/08%20Builds
POST /api/projects/{projectId}/artifacts/AAB/08%20Builds
POST /api/projects/{projectId}/builds
```

지원 Build 유형:

- `DEBUG`
- `UNSIGNED_RELEASE`
- `SIGNED_RELEASE`

Codex Worker에는 signing key가 없으므로 Codex 단계에서는 `DEBUG` 또는
`UNSIGNED_RELEASE`를 사용한다.

현재 웹의 `파일` 화면은 등록된 Artifact 조회·다운로드용이며 일반 Artifact 업로드
폼은 없다. 업로드는 승인된 Adapter/API가 수행한다. 파일 크기 제한은 기본 50 MiB다.

## 14. Release Gate와 최종 승인

1. 프로젝트의 `빌드`를 연다.
2. `Release Candidate 생성`에서 다음 세 기록을 선택한다.

- Build
- Test Run
- Security Scan

3. 세 기록의 Commit SHA가 모두 같은지 확인한다.
4. `Release Gate 실행 및 Candidate 생성`을 누른다.

Gate가 다시 확인하는 항목:

- 잠긴 PRD와 Build의 PRD SHA-256 일치
- Test Run, Security Scan, Build의 Commit SHA 일치
- 테스트 성공과 Acceptance Criteria 충족
- Security Scan 성공
- 미해결 CRITICAL 없음
- 위험 수용되지 않은 HIGH 없음
- SBOM 존재
- Build 성공
- APK/AAB Artifact와 저장된 SHA-256 일치

차단되면 blocker 목록을 확인하고 새 Codex Task와 새 검증 기록으로 해결한다. 실패한
기록을 성공으로 수정하지 말고 새 기록을 만든다.

Gate를 통과하면 Release 상태가 `CANDIDATE`가 된다.

1. 최종 승인 사유를 입력한다.
2. `Release Candidate 승인`을 누른다.
3. 상태가 `APPROVED`, 프로젝트가 `FINAL_APPROVAL`인지 확인한다.
4. APK/AAB의 `다운로드`로 승인된 Artifact를 확인한다.

## 15. 서명과 최종 Release

승인된 Release에서 `Signing Worker 요청`을 누를 수 있지만 현재 Stub은
`NOT_CONFIGURED`를 반환한다. 실제 서명이 구성되기 전에는 다음 상태가 정상이다.

- Build가 `미서명`
- unsigned 또는 debug Artifact만 다운로드 가능
- Release가 자동으로 `SIGNED` 또는 `RELEASED`가 되지 않음

향후 Signing Worker는 승인된 Commit SHA, PRD Hash, Test Run, Security Scan, Release
Candidate와 Build Hash를 모두 재검증해야 한다.

## 16. 자주 사용하는 재작업 흐름

| 상황                  | 권장 조치                                          |
| --------------------- | -------------------------------------------------- |
| PRD 요구사항이 바뀜   | 잠긴 PRD를 수정하지 말고 새 PRD 버전부터 다시 승인 |
| 코드 리뷰 수정        | `리뷰 수정` Task 또는 후속 지시                    |
| 테스트 실패           | `테스트 수정` Task 후 새 Commit으로 전체 검증      |
| HIGH/CRITICAL Finding | `보안 수정` Task, HIGH만 예외적으로 위험 수용      |
| 빌드 실패             | 원인 수정 후 새 `Release Candidate 빌드` Task      |
| Codex가 범위를 벗어남 | 작업 중단, allowed/denied paths를 강화해 새 지시   |
| Worker 응답 없음      | Queue, Redis, systemd 상태와 Worker journal 확인   |
| 동일 작업 중복 생성   | 기존 Task 상태를 확인하고 후속 지시 사용           |

## 17. 현재 MVP에서 UI만으로 완료되지 않는 항목

다음 항목은 현재 웹에서 결과를 검토할 수 있지만 생성·제출은 승인된 외부 Adapter 또는
REST API가 담당한다.

- 일반 Artifact 업로드
- Acceptance Criteria를 충족한 최종 Test Run 등록
- Security Scan과 SBOM 등록
- APK/AAB Build record 등록
- 실제 release signing

따라서 실제 운영 자동화의 완료 기준은 다음과 같다.

```text
Real Codex Worker
  + GitHub CI/Test Adapter
  + Security Scanner/SBOM Adapter
  + Android Build/Artifact Adapter
  + 향후 Signing Worker
```

API 요청에는 로그인 Session, `x-csrf-token`, 역할 권한과 request ID가 적용된다.
범용 Shell이나 범용 SQL을 Factory 웹/API에 연결하지 않는다.

## 18. 최종 체크리스트

- [ ] 실제 ChatGPT PRD를 `.md` 또는 `.json`으로 업로드
- [ ] Acceptance Criteria와 제외 범위 입력
- [ ] CEO Constraint와 Decision Record 검토
- [ ] 최종 승인 후 PRD `LOCKED`
- [ ] GitHub Repository `REPO_READY`
- [ ] Codex Run Adapter가 `real`
- [ ] Git diff, Commit SHA, Pull Request 검토
- [ ] 승인된 Test Run `PASSED`, Acceptance Criteria 충족
- [ ] Security Scan `PASSED`, SBOM 연결
- [ ] CRITICAL 0, 미수용 HIGH 0
- [ ] Build `SUCCEEDED`, APK/AAB Hash 확인
- [ ] 세 품질 기록의 Commit SHA 일치
- [ ] Release Gate 통과
- [ ] CEO 최종 승인 사유 기록
- [ ] Artifact 다운로드 및 Hash 확인
- [ ] 실제 서명 전에는 미서명 상태임을 명확히 표시
- [ ] 감사 로그와 활동 기록 확인
