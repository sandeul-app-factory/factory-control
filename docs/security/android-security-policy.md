# Android Security Scan Policy

## Required checks

Android Release Candidate 작업은 다음 결과를 하나의 Security Scan 또는 연결된 복수
report로 제출해야 한다.

- Android Lint, detekt, ktlint
- Unit Test와 Compose UI Test
- Gradle dependency/OSV scan
- gitleaks, Semgrep, Trivy filesystem scan
- MobSF Adapter 결과
- Android Manifest와 exported component
- Network Security Config와 cleartext traffic
- WebView JavaScript, file URL access, JavaScript bridge, TLS error handling
- debuggable 및 backup/data extraction policy
- CycloneDX 또는 SPDX SBOM

`@sandeul/security`의 Android baseline detector는 Manifest와 Kotlin/Java 소스에서
debuggable, cleartext, exported component, WebView, TLS 우회, 하드코딩 Secret의
고위험 패턴을 검사한다. 이는 Android Lint, Semgrep, MobSF를 대체하지 않고 빠른
fail-fast 방어층으로 사용한다.

Real Codex 작업은 구현 완료 후 Worker가 위 검사를 자동 실행한다. Gitleaks, Semgrep,
Trivy, OSV-Scanner, Syft 중 하나라도 설치되지 않았거나 실행에 실패하면 HIGH Finding을
생성하고 Release Gate를 차단한다. MobSF Endpoint 미설정은 현재 INFO로 기록하며 실제
Signing Worker 도입 전에 운영 정책에 따라 필수 Gate로 승격한다.

Worker는 `assembleDebug`, `bundleRelease` 뒤 전용 Emulator에 debug APK를 설치한다.
`ANDROID_SMOKE_TEST_SERIAL` 미설정, offline device, 설치 실패는 Test Run 실패다.

## Severity and gate

- CRITICAL: Release 차단, 위험 수용 불가
- HIGH: Release 차단, CEO/SECURITY_REVIEWER의 명시적·유효한 위험 수용만 예외
- MEDIUM/LOW/INFO: 표시하고 수정 또는 후속 Decision Record로 추적
- 검사 실패, SBOM 실패, 빌드 실패, 테스트 실패: Release 차단

## Signing key

Codex Worker의 환경·workspace·prompt에는 실제 signing key 경로를 전달하지 않는다.
`.jks`, `.keystore`, `google-services.json`, `.env`는 기본 denied path에 포함된다.
Signing Worker는 별도 OS 사용자 또는 HSM/KMS 경계를 사용해야 하며 실제 구현 전에는
비활성 상태를 유지한다.
