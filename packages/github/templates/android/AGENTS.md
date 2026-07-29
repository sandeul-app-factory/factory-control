# Android App Repository Instructions

## Priority

1. Factory가 제공한 잠긴 PRD와 PRD SHA-256
2. CEO Constraint
3. Decision Record
4. 현재 Development Task와 Acceptance Criteria
5. 이 문서와 Repository의 기존 code rule

잠긴 PRD를 수정하거나 요구사항을 임의 확장하지 않는다. 불명확한 내용은 가정으로
숨기지 말고 완료 보고서에 질문 또는 가정으로 기록한다.

## Kotlin and Compose

- Kotlin official style, null-safety, immutable state를 기본으로 한다.
- UI는 Jetpack Compose와 접근성 semantics를 사용한다.
- 화면 composable에 network/database business logic을 두지 않는다.
- lifecycle-aware state collection과 structured concurrency를 사용한다.
- 관련 없는 dependency 또는 refactor를 추가하지 않는다.

## Architecture

- UI, domain, data 계층의 의존성 방향을 지킨다.
- Android framework type이 domain layer로 누출되지 않게 한다.
- Repository interface와 production/fake implementation을 분리한다.
- navigation argument와 external intent input을 검증한다.

## Security

- Secret, API key, token, signing key를 source/resource/BuildConfig에 hard-code하지 않는다.
- Codex 작업에서 release keystore와 signing credential에 접근하지 않는다.
- `android:exported="true"`는 명시적 승인과 permission/입력 검증 없이 사용하지 않는다.
- 불필요한 exported Activity, Service, Receiver, Provider를 만들지 않는다.
- TLS certificate/hostname 검증을 우회하지 않는다.
- Network Security Config에서 cleartext traffic을 기본 차단한다.
- WebView는 불필요한 JavaScript/file access를 끄고 `addJavascriptInterface`를 사용하지
  않는다. 외부 URL은 allowlist로 검증한다.
- release에서 `debuggable=false`를 검증하고 backup 정책을 명시한다.

## Required Checks

```bash
./gradlew ktlintCheck
./gradlew detekt
./gradlew lint
./gradlew test
./gradlew connectedCheck
./gradlew assembleRelease
./gradlew bundleRelease
```

사용할 수 없는 emulator 검사는 실패를 숨기지 말고 별도 미실행 항목으로 보고한다. 기존
테스트를 삭제하거나 skip해서 통과시키지 않는다.

## Release Definition of Done

- 잠긴 PRD hash와 대상 commit SHA 일치
- Acceptance Criteria별 검증 결과 기록
- Unit/Compose UI/Android Lint/detekt/ktlint 통과
- Manifest, exported component, Network Security Config, WebView, debuggable, backup 검사
- gitleaks/Semgrep/dependency/Trivy 검사와 SBOM 생성
- unsigned 또는 임시 서명 artifact SHA-256 보고
- 실제 release signing은 Factory의 별도 Signing Worker에서만 수행
