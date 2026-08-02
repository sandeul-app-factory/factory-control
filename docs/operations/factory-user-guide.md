# Sandeul App Factory 사용설명서

이 문서는 최종 PRD와 Figma 디자인 산출물을 Factory에 직접 업로드하고, 한 번의 개발 시작으로 Codex 개발부터 테스트·보안검사·빌드·Release Gate까지 수행하는 현재 운영 절차를 설명한다.

## 1. 현재 작업 흐름

```text
ChatGPT에서 PRD 기획·검토
  → Factory 프로젝트 생성
  → 최종 prd.json 업로드 및 서버 검증
  → 검증 성공 시 새 PRD 버전 자동 잠금
  → Figma에서 내보낸 디자인과 구현 설명 업로드
  → GitHub Repository 생성 또는 기존 Repository 연결
  → IMPLEMENT_PRD 작업 자동 생성
  → 개발 작업 탭에서 개발 시작
  → Codex 구현·Commit·Branch push·Pull Request 생성
  → 독립 테스트·보안검사·SBOM·Android 빌드
  → Release Gate 판정 및 Release Candidate 생성
```

PRD 승인 대기와 수동 승인 단계는 기본값으로 비활성화되어 있다. Schema 검증을 통과한 업로드가 현재 Canonical PRD로 자동 잠긴다. 이 단순화는 PRD 무결성, 테스트, 보안검사, 빌드 및 Release Gate를 우회하지 않는다.

## 2. 화면 구성

- `대시보드`: 프로젝트와 공장 상태 요약
- `프로젝트`: PRD, 디자인, Repository 등 개발 입력자료 준비
- `개발 작업`: 모든 프로젝트의 Task, Codex 진행 요약, 테스트·보안·빌드·Gate 상태 확인
- `감사 로그`: 주요 사용자·시스템 작업 추적
- `설정`: Adapter, MCP, 인증 및 운영 상태 확인

별도의 승인 대기, 테스트, 보안검사, 빌드 메뉴는 없다. 해당 결과는 관련 개발 작업의 상태 카드에 통합 표시된다.

## 3. 사전 준비

- Web/API/PostgreSQL/Redis/MinIO가 정상이어야 한다.
- CEO 관리자 계정으로 로그인할 수 있어야 한다.
- GitHub App 또는 PAT Adapter가 설정되어야 한다.
- Real Codex Worker와 Android/보안 도구가 실행 환경에 준비되어야 한다.
- Worker 동시 실행 수 기본값은 1이다.

Windows Worker 점검:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1 -CheckOnly
```

Windows Worker 실행:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infra\scripts\start-real-worker.ps1
```

macOS Docker 운영은 [macos-docker.md](./macos-docker.md)를 따른다.

## 4. 프로젝트와 PRD 준비

1. `프로젝트`에서 새 프로젝트를 만든다.
2. 프로젝트를 선택하고 `PRD 작성 가이드`와 `최신 JSON Schema`를 받는다.
3. ChatGPT에서 기획·반려·수정을 끝낸 최종 `prd.json`을 준비한다.
4. `최종 PRD 업로드`에서 JSON 파일을 선택해 업로드한다.
5. 서버 검증 결과와 SHA-256, 버전, `LOCKED` 상태를 확인한다.

Canonical 형식은 JSON을 권장한다.

- JSON Schema: `schemas/prd/android-build-ready-v1.schema.json`
- Markdown Template: `docs/templates/android-build-ready-prd.md`

필수 필드 누락, 잘못된 ID 참조, SDK 기준 미달, 위험한 Android 설정은 서버가 거부한다. 잠긴 버전은 수정하지 않는다. 변경이 필요하면 고친 전체 파일을 새 버전으로 업로드한다. 이미 개발이 시작된 프로젝트의 PRD 교체는 의도치 않은 기준 변경을 막기 위해 차단된다.

## 5. Figma 디자인 업로드

1. Figma에서 화면을 PNG, JPG/JPEG, WebP 또는 PDF로 내보낸다.
2. PRD 기능명 또는 화면 ID가 드러나도록 파일명을 지정한다. 순서가 중요하면 `01_홈.png`처럼 번호를 붙인다.
3. 화면별 상태, 상호작용, 간격과 구현 규칙을 하나의 Markdown 문서로 정리한다. 각 제목에는 대응하는 PRD 기능명, 화면 ID 또는 이미지 파일명을 적는다.
4. 프로젝트의 `디자인 도안` 영역에서 화면 파일 여러 장과 통합 `.md`를 한 번에 선택한다.
5. Markdown에 없는 예외만 각 화면의 `화면별 추가 설명`에 입력하고 일괄 업로드한다.
6. 업로드 후 화면 도안과 통합 스펙의 파일명, 설명, 버전과 해시를 확인한다.

한 번에 최대 30개를 선택할 수 있다. 통합 Markdown을 포함하지 않으면 모든 화면 파일에 개별 설명을 입력해야 한다. SVG는 능동 콘텐츠 위험 때문에 받지 않으며 `.fig` 원본도 직접 처리하지 않는다.

Worker는 작업 시작 시 최신 디자인 산출물을 해시 검증하여 `.factory-input/designs`에 읽기 전용 입력자료로 배치한다. Manifest에는 원본 파일명, MIME type, `SCREEN_EXPORT` 또는 `SPECIFICATION` 역할, 설명, SHA-256과 로컬 경로가 기록된다. Codex는 `SPECIFICATION` Markdown을 먼저 읽고 파일명·화면 ID·기능명으로 PNG와 잠긴 PRD를 연결한다. 이 폴더는 Commit 대상에서 제외된다.

같은 파일명을 다시 업로드하면 이전 Artifact는 보존되지만 Codex 작업에는 가장 최근에 업로드한 파일만 전달된다.

권장 Markdown 형식:

```markdown
## SCR-MEMO-LIST · 메모 목록 · 01\_메모목록.png

- 기준 크기: 390×844
- 상태: 기본, 로딩, 빈 목록, 오류
- 상단 추가 버튼: 메모 작성 화면으로 이동
- 카드 간격: 12dp
- 접근성: 글꼴 확대 200%에서 버튼과 제목이 겹치지 않음
```

## 6. Repository 준비

잠긴 PRD가 있는 프로젝트에서 다음 중 하나를 수행한다.

- Template Repository를 사용해 새 Repository 생성
- 기존 GitHub Repository 연결

Factory는 기본 브랜치와 대상 Commit을 확인한다. Repository가 `REPO_READY`가 되면 현재 잠긴 PRD를 기준으로 `IMPLEMENT_PRD` Task가 `DRAFT` 상태로 한 번만 생성된다.

새 Repository에는 `AGENTS.md`, README, PR template, `docs/factory` 기준 파일이 초기화된다. Factory는 Pull Request를 자동 병합하지 않는다.

## 7. 개발 시작과 상태 확인

1. 전역 `개발 작업` 메뉴를 연다.
2. 프로젝트를 선택한다.
3. `DRAFT` Task의 PRD Hash, Repository, 대상 Branch를 확인한다.
4. `개발 시작`을 누른다.

Task는 다음 순서로 바뀐다.

```text
DRAFT → QUEUED → RUNNING → SUCCEEDED
                         ↘ FAILED / BLOCKED / CANCELLED
```

화면에는 JSONL 원문이나 Shell 출력 전체를 보여주지 않는다. 사람이 이해할 수 있는 진행 요약과 다음 상태 카드만 표시한다.

- 개발
- 테스트
- 보안
- 빌드
- Release Gate

원본 Codex 이벤트는 장애 분석과 감사 목적으로 서버에 보존하지만 일반 화면과 SSE 응답에는 raw payload를 노출하지 않는다. 작업을 중단하면 Worker가 실행 프로세스 종료를 확인한 뒤 `CANCELLED`로 기록한다.

## 8. 자동 실행 파이프라인

`개발 시작` 한 번으로 아래 단계가 이어진다. 각 단계가 실패하면 성공으로 표시하지 않고 후속 단계 또는 Gate를 차단한다.

### Codex 개발

Worker는 대상 Commit, 잠긴 PRD Hash, 최신 Task 지시, `AGENTS.md`, 허용·금지 경로, 디자인 입력자료를 검증한다. Codex는 `workspace-write` sandbox와 구조화된 결과 Schema로 실행된다.

### 독립 테스트

Codex의 자체 보고와 별도로 Worker가 Repository의 고정 명령을 실행한다.

```text
./gradlew test
./gradlew lint
./gradlew detekt
./gradlew ktlintCheck
```

Acceptance Criteria마다 확인 증거가 있어야 한다. `NOT_VERIFIED` 또는 실패 항목이 있으면 Test Run은 실패한다.

### 보안검사와 SBOM

- Android Manifest/Source baseline
- Gitleaks
- Semgrep
- Trivy filesystem scan
- OSV-Scanner
- Syft SPDX JSON SBOM
- 선택적 MobSF Adapter

도구 누락 또는 실행 오류를 성공으로 바꾸지 않는다. CRITICAL/HIGH finding, 보안검사 실패 또는 SBOM 누락은 Release Gate를 차단한다.

### Android 빌드

Worker는 debug APK와 가능한 경우 unsigned release AAB를 생성해 Object Storage에 올리고 SHA-256을 재검증한다. Codex Worker는 실제 배포용 signing key에 접근하지 않는다. 전용 Emulator serial이 설정된 경우 debug APK 설치 Smoke Test도 수행한다.

### Release Gate

Gate는 같은 Commit SHA와 PRD Hash에 연결된 다음 결과를 확인한다.

- Test Run 성공과 Acceptance Criteria 충족
- Security Scan 성공, CRITICAL 0, 미수용 HIGH 0
- SPDX SBOM 존재
- Build 성공, Artifact 존재, SHA-256 일치
- Test/Security/Build의 Commit SHA 일치

통과하면 Release는 `CANDIDATE`, 프로젝트는 `RELEASE_CANDIDATE`가 된다. 승인 워크플로가 비활성화된 현재 구성에서는 Factory UI의 별도 Release 승인 단계도 사용하지 않는다. 실제 배포 서명은 여전히 Signing Worker가 필요하며 MVP는 Stub이다.

## 9. 결과 검토와 후속 작업

개발 작업 상세에서 다음을 확인한다.

- 현재 단계와 사람이 읽을 수 있는 진행 요약
- 변경 파일과 변경 이유
- Commit SHA, Branch, Pull Request URL
- 테스트, 보안, 빌드, Release Gate 상태
- 실패 또는 차단 사유

필요하면 `FIX_REVIEW`, `FIX_TEST`, `FIX_SECURITY` 또는 허용된 후속 Task를 만든다. 사용자 지시는 기존 값을 덮어쓰지 않고 새 `TaskInstructionVersion`으로 저장한다.

## 10. 대표적인 실패 대응

| 상태                     | 조치                                                       |
| ------------------------ | ---------------------------------------------------------- |
| PRD 검증 실패            | 표시된 JSON 경로와 사유를 반영해 전체 PRD를 새로 생성      |
| Task가 계속 `QUEUED`     | Real Worker 실행 여부, Redis 연결, 동시 실행 슬롯 확인     |
| Codex `BLOCKED`/`FAILED` | 요약된 사유와 결과 보고를 확인하고 후속 지시 작성          |
| Gradle 검사 실패         | `FIX_TEST` Task로 코드 또는 테스트 보완                    |
| CRITICAL/HIGH Finding    | `FIX_SECURITY` Task로 수정; CRITICAL은 수용 불가           |
| Scanner/Syft 누락        | Worker 이미지 또는 호스트 도구 설치 후 재작업              |
| APK/AAB 빌드 실패        | 빌드 상태 요약과 Gradle 보고 Artifact를 기준으로 수정      |
| GitHub push/PR 실패      | GitHub 권한, 기본 Branch, 네트워크를 확인한 뒤 재작업      |
| Gate 차단                | 실패 결과를 고치고 새 Commit에 대해 전체 파이프라인 재실행 |

## 11. 운영 체크리스트

- [ ] `prd.json` Schema 검증 및 자동 `LOCKED`
- [ ] Figma 디자인 산출물과 구현 설명 업로드
- [ ] Repository `REPO_READY`
- [ ] `IMPLEMENT_PRD` Task `DRAFT`
- [ ] Real Codex Adapter 및 Worker 정상
- [ ] Commit, Branch, PR 확인
- [ ] Test Run `PASSED`
- [ ] Acceptance Criteria 전체 검증
- [ ] Security Scan `PASSED`
- [ ] CRITICAL 0, 미수용 HIGH 0
- [ ] SPDX SBOM 존재
- [ ] Build `SUCCEEDED`
- [ ] APK/AAB 파일과 SHA-256 확인
- [ ] Release `CANDIDATE`
- [ ] 실제 signing 전 승인 Commit과 PRD Hash 재검증
- [ ] 감사 로그 확인
