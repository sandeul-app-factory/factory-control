# Android Build-ready PRD

## 문서 메타데이터

- Schema: android-build-ready/v1
- 담당자: 산들, 수빈
- 문서 버전: 0.1.0
- 제품 유형: ANDROID_APP
- 목표 출시:

## 제품 정의

### 문제

### 타깃 사용자

### 핵심 가치

### 목표와 측정 지표

### 비목표

### 수익모델

## 출시 범위

### 반드시 포함

### 명시적 제외

### 차기 버전

## 사용자 여정

### UJ-001

- 사전조건:
- 단계:
- 성공 결과:
- 실패 시나리오:

## 화면 명세

### SCR-001

- Route:
- 목적:
- 구성요소:
- 액션:
- 상태: INITIAL, LOADING, CONTENT, EMPTY, ERROR, OFFLINE
- 오류 처리:
- 접근성:

## 기능 요구사항

### FR-001

- Feature:
- 입력:
- 비즈니스 규칙:
- 출력:
- 오류:
- 관련 화면:

## 데이터 명세

### 엔티티

### 로컬 저장

### 동기화

### 삭제와 마이그레이션

### 오프라인

## API 명세

### API-001

- Method/Path:
- 인증:
- Request:
- Response:
- 오류:
- Timeout/Retry:

## Android 기술 기준

- applicationId:
- appName:
- minSdk:
- targetSdk: 36
- compileSdk: 36
- Java toolchain: 17
- Kotlin + Jetpack Compose
- Architecture:
- 모듈:
- 지원 언어:
- 화면 방향:

## 권한

- Android Permission:
- 사용 목적:
- 요청 시점:
- 거부 시 동작:

## 보안

- Secret 관리:
- Network Security:
- exported component:
- backup:
- release debuggable: false
- WebView:
- TLS 우회: 금지

## 개인정보

- 수집 항목:
- 동의:
- 보존:
- 삭제:
- 개인정보처리방침:

## 디자인

- 디자인 시스템:
- 색상:
- Typography:
- 아이콘/이미지 Artifact:
- 누락 Asset 처리:

## 빌드

- 산출물: APK, AAB
- Unit: ./gradlew test
- Lint: ./gradlew lint
- Static: ./gradlew detekt, ./gradlew ktlintCheck
- Debug APK: ./gradlew assembleDebug
- Release Bundle: ./gradlew bundleRelease
- 서명: UNSIGNED_OR_DEBUG_ONLY

## 테스트

### Unit

### UI

### Integration

### 접근성

### 오프라인 및 복구

### 기기 매트릭스

## Acceptance Criteria

### AC-001

- Requirement: FR-001
- Given:
- When:
- Then:
- Verification:
- Mandatory: true

## Release Gate

- 모든 테스트 통과
- Acceptance Criteria 충족
- CRITICAL 0
- HIGH 0
- SBOM 필수
- APK 설치 Smoke Test 필수
- Artifact SHA-256 필수

## 가정 및 미결정 사항

### 가정

### 미결정 사항

## 위험

### RSK-001

- 분류:
- 영향:
- 완화책:
