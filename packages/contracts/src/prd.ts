import { z } from "zod";

export const androidBuildReadyPrdSchemaVersion = "android-build-ready/v1" as const;
export const fixedProductOwners = ["산들", "수빈"] as const;

const nonEmpty = z.string().trim().min(1);
const requirementId = z.string().regex(/^[A-Z]{2,5}-[0-9]{3}$/);
const screenId = z.string().regex(/^SCR-[0-9]{3}$/);
const criterionId = z.string().regex(/^AC-[0-9]{3}$/);

const measurableGoalSchema = z
  .object({
    id: requirementId,
    description: nonEmpty.max(1000),
    metric: nonEmpty.max(500),
    target: nonEmpty.max(500),
  })
  .strict();

const targetUserSchema = z
  .object({
    id: z.string().regex(/^USR-[0-9]{3}$/),
    segment: nonEmpty.max(300),
    need: nonEmpty.max(1000),
    usageContext: nonEmpty.max(1000),
  })
  .strict();

const featureSchema = z
  .object({
    id: requirementId,
    name: nonEmpty.max(300),
    description: nonEmpty.max(3000),
    priority: z.enum(["MUST", "SHOULD", "COULD"]),
  })
  .strict();

const userJourneySchema = z
  .object({
    id: z.string().regex(/^UJ-[0-9]{3}$/),
    title: nonEmpty.max(300),
    actor: nonEmpty.max(300),
    preconditions: z.array(nonEmpty.max(1000)).min(1),
    steps: z.array(nonEmpty.max(2000)).min(2),
    successOutcome: nonEmpty.max(2000),
    failureScenarios: z.array(nonEmpty.max(2000)).min(1),
  })
  .strict();

const screenSchema = z
  .object({
    id: screenId,
    name: nonEmpty.max(200),
    route: z
      .string()
      .trim()
      .regex(/^\/[A-Za-z0-9_{}?&=./-]*$/),
    purpose: nonEmpty.max(1000),
    entryConditions: z.array(nonEmpty.max(1000)).min(1),
    components: z.array(nonEmpty.max(1000)).min(1),
    actions: z.array(nonEmpty.max(1500)).min(1),
    states: z.array(z.enum(["INITIAL", "LOADING", "CONTENT", "EMPTY", "ERROR", "OFFLINE"])).min(3),
    errorHandling: z.array(nonEmpty.max(1500)).min(1),
    accessibility: z.array(nonEmpty.max(1000)).min(1),
    nextScreens: z.array(screenId),
  })
  .strict();

const functionalRequirementSchema = z
  .object({
    id: requirementId,
    featureId: requirementId,
    title: nonEmpty.max(300),
    description: nonEmpty.max(3000),
    inputs: z.array(nonEmpty.max(1000)),
    businessRules: z.array(nonEmpty.max(2000)).min(1),
    outputs: z.array(nonEmpty.max(1000)).min(1),
    errors: z.array(nonEmpty.max(1500)).min(1),
    screenIds: z.array(screenId).min(1),
  })
  .strict();

const dataEntitySchema = z
  .object({
    name: z.string().regex(/^[A-Z][A-Za-z0-9]{1,99}$/),
    purpose: nonEmpty.max(1000),
    fields: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z][A-Za-z0-9]{0,99}$/),
            type: nonEmpty.max(100),
            required: z.boolean(),
            sensitive: z.boolean(),
            validation: nonEmpty.max(1000),
          })
          .strict(),
      )
      .min(1),
    localPersistence: z.boolean(),
    retention: nonEmpty.max(1000),
  })
  .strict();

const apiEndpointSchema = z
  .object({
    id: z.string().regex(/^API-[0-9]{3}$/),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().trim().startsWith("/").max(500),
    purpose: nonEmpty.max(1000),
    authentication: nonEmpty.max(500),
    requestExample: z.record(z.string(), z.unknown()),
    responseExample: z.record(z.string(), z.unknown()),
    errorCodes: z.array(nonEmpty.max(1000)).min(1),
    timeoutMs: z.number().int().min(1000).max(120000),
    retryPolicy: nonEmpty.max(1000),
  })
  .strict();

const permissionSchema = z
  .object({
    name: z.string().regex(/^android\.permission\.[A-Z0-9_]+$/),
    required: z.boolean(),
    purpose: nonEmpty.max(1000),
    requestMoment: nonEmpty.max(1000),
    denialBehavior: nonEmpty.max(1000),
  })
  .strict();

const acceptanceCriterionSchema = z
  .object({
    id: criterionId,
    requirementIds: z.array(requirementId).min(1),
    title: nonEmpty.max(300),
    given: nonEmpty.max(2000),
    when: nonEmpty.max(2000),
    then: nonEmpty.max(3000),
    verification: nonEmpty.max(2000),
    mandatory: z.literal(true),
  })
  .strict();

const riskSchema = z
  .object({
    id: z.string().regex(/^RSK-[0-9]{3}$/),
    category: z.enum(["PRODUCT", "TECHNICAL", "SECURITY", "PRIVACY", "OPERATION", "STORE"]),
    description: nonEmpty.max(2000),
    impact: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    mitigation: nonEmpty.max(2000),
  })
  .strict();

function uniqueBy<T>(items: T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

export const androidBuildReadyPrdSchema = z
  .object({
    schemaVersion: z.literal(androidBuildReadyPrdSchemaVersion),
    metadata: z
      .object({
        title: nonEmpty.max(200),
        documentVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
        owners: z.tuple([z.literal("산들"), z.literal("수빈")]),
        productType: z.literal("ANDROID_APP"),
        status: z.literal("DRAFT"),
        lastUpdatedAt: z.iso.datetime(),
        targetRelease: nonEmpty.max(200),
      })
      .strict(),
    product: z
      .object({
        summary: nonEmpty.max(5000),
        problem: nonEmpty.max(10000),
        valueProposition: nonEmpty.max(3000),
        targetUsers: z.array(targetUserSchema).min(1),
        goals: z.array(measurableGoalSchema).min(1),
        nonGoals: z.array(nonEmpty.max(1000)).min(1),
        revenueModel: nonEmpty.max(2000),
        successMetrics: z.array(nonEmpty.max(1000)).min(1),
      })
      .strict(),
    releaseScope: z
      .object({
        mustHave: z.array(featureSchema).min(1),
        shouldHave: z.array(featureSchema),
        outOfScope: z.array(nonEmpty.max(2000)).min(1),
        futureScope: z.array(nonEmpty.max(2000)),
      })
      .strict(),
    userJourneys: z.array(userJourneySchema).min(1),
    screens: z.array(screenSchema).min(1),
    functionalRequirements: z.array(functionalRequirementSchema).min(1),
    data: z
      .object({
        entities: z.array(dataEntitySchema),
        localStorage: nonEmpty.max(2000),
        remoteSync: nonEmpty.max(2000),
        migrationPolicy: nonEmpty.max(2000),
        deletionPolicy: nonEmpty.max(2000),
        offlinePolicy: nonEmpty.max(2000),
      })
      .strict(),
    api: z
      .object({
        required: z.boolean(),
        baseUrlPolicy: nonEmpty.max(1000),
        authentication: nonEmpty.max(1000),
        endpoints: z.array(apiEndpointSchema),
        unavailableBackendStrategy: nonEmpty.max(2000),
      })
      .strict(),
    android: z
      .object({
        applicationId: z
          .string()
          .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/)
          .max(200),
        appName: nonEmpty.max(100),
        minSdk: z.number().int().min(23).max(36),
        targetSdk: z.number().int().min(36),
        compileSdk: z.number().int().min(36),
        versionCode: z.number().int().positive(),
        versionName: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/),
        javaToolchain: z.literal(17),
        language: z.literal("KOTLIN"),
        uiFramework: z.literal("JETPACK_COMPOSE"),
        architecture: z.enum(["CLEAN_MVVM", "MVI"]),
        dependencyInjection: z.enum(["HILT", "KOIN", "NONE"]),
        persistence: z.enum(["ROOM", "DATASTORE", "NONE"]),
        networkClient: z.enum(["KOTLINX_HTTP", "RETROFIT_OKHTTP", "NONE"]),
        modules: z.array(nonEmpty.max(200)).min(1),
        orientations: z.array(z.enum(["PORTRAIT", "LANDSCAPE"])).min(1),
        locales: z.array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)).min(1),
        theme: z.enum(["LIGHT", "DARK", "SYSTEM"]),
      })
      .strict()
      .refine((value) => value.compileSdk >= value.targetSdk, {
        message: "compileSdk는 targetSdk 이상이어야 합니다.",
        path: ["compileSdk"],
      }),
    permissions: z.array(permissionSchema),
    security: z
      .object({
        dataClassification: z.array(nonEmpty.max(1000)).min(1),
        secretsPolicy: nonEmpty.max(2000),
        networkSecurity: nonEmpty.max(2000),
        exportedComponents: z.array(nonEmpty.max(1000)),
        backupAllowed: z.boolean(),
        releaseDebuggable: z.literal(false),
        screenshotsAllowed: z.boolean(),
        webView: z
          .object({
            used: z.boolean(),
            javascriptEnabled: z.boolean(),
            allowedOrigins: z.array(z.url()),
            fileAccessAllowed: z.literal(false),
          })
          .strict(),
        tlsValidationBypassAllowed: z.literal(false),
      })
      .strict(),
    privacy: z
      .object({
        personalData: z.array(nonEmpty.max(1000)),
        consentFlow: nonEmpty.max(2000),
        retention: nonEmpty.max(2000),
        deletion: nonEmpty.max(2000),
        privacyPolicyRequired: z.boolean(),
      })
      .strict(),
    design: z
      .object({
        designSystem: nonEmpty.max(1000),
        colors: z.array(nonEmpty.max(200)).min(2),
        typography: z.array(nonEmpty.max(500)).min(1),
        iconArtifactIds: z.array(z.uuid()),
        imageArtifactIds: z.array(z.uuid()),
        missingAssetPolicy: nonEmpty.max(2000),
      })
      .strict(),
    observability: z
      .object({
        analyticsEvents: z.array(nonEmpty.max(500)),
        crashReporting: nonEmpty.max(1000),
        loggingPolicy: nonEmpty.max(2000),
        sensitiveFieldsExcluded: z.array(nonEmpty.max(300)),
      })
      .strict(),
    build: z
      .object({
        variants: z.array(z.enum(["debug", "release"])).min(1),
        artifactTypes: z.array(z.enum(["APK", "AAB"])).min(1),
        commands: z
          .object({
            unitTest: z.literal("./gradlew test"),
            lint: z.literal("./gradlew lint"),
            staticAnalysis: z.array(z.enum(["./gradlew detekt", "./gradlew ktlintCheck"])),
            debugApk: z.literal("./gradlew assembleDebug"),
            releaseBundle: z.literal("./gradlew bundleRelease"),
          })
          .strict(),
        signing: z.literal("UNSIGNED_OR_DEBUG_ONLY"),
        reproducibility: nonEmpty.max(2000),
      })
      .strict(),
    testPlan: z
      .object({
        unit: z.array(nonEmpty.max(1500)).min(1),
        ui: z.array(nonEmpty.max(1500)).min(1),
        integration: z.array(nonEmpty.max(1500)).min(1),
        accessibility: z.array(nonEmpty.max(1500)).min(1),
        offlineAndRecovery: z.array(nonEmpty.max(1500)).min(1),
        deviceMatrix: z.array(nonEmpty.max(500)).min(1),
      })
      .strict(),
    acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
    releaseGates: z
      .object({
        allTestsPass: z.literal(true),
        acceptanceCriteriaMet: z.literal(true),
        criticalFindingsAllowed: z.literal(0),
        highFindingsAllowed: z.literal(0),
        sbomRequired: z.literal(true),
        installSmokeTestRequired: z.literal(true),
        artifactSha256Required: z.literal(true),
      })
      .strict(),
    assumptions: z.array(nonEmpty.max(2000)),
    openQuestions: z.array(nonEmpty.max(2000)),
    risks: z.array(riskSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const uniquenessChecks: Array<[Array<{ id: string }>, string]> = [
      [value.product.targetUsers, "product.targetUsers"],
      [value.product.goals, "product.goals"],
      [[...value.releaseScope.mustHave, ...value.releaseScope.shouldHave], "releaseScope"],
      [value.userJourneys, "userJourneys"],
      [value.screens, "screens"],
      [value.functionalRequirements, "functionalRequirements"],
      [value.api.endpoints, "api.endpoints"],
      [value.acceptanceCriteria, "acceptanceCriteria"],
      [value.risks, "risks"],
    ];
    for (const [items, path] of uniquenessChecks) {
      if (!uniqueBy(items, (item) => item.id)) {
        context.addIssue({
          code: "custom",
          message: `${path} ID는 중복될 수 없습니다.`,
          path: [path],
        });
      }
    }

    const featureIds = new Set(
      [...value.releaseScope.mustHave, ...value.releaseScope.shouldHave].map((item) => item.id),
    );
    const screenIds = new Set(value.screens.map((item) => item.id));
    const requirementIds = new Set(value.functionalRequirements.map((item) => item.id));
    for (const requirement of value.functionalRequirements) {
      if (!featureIds.has(requirement.featureId)) {
        context.addIssue({
          code: "custom",
          message: `존재하지 않는 Feature ID입니다: ${requirement.featureId}`,
          path: ["functionalRequirements", requirement.id, "featureId"],
        });
      }
      for (const id of requirement.screenIds) {
        if (!screenIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: `존재하지 않는 Screen ID입니다: ${id}`,
            path: ["functionalRequirements", requirement.id, "screenIds"],
          });
        }
      }
    }
    for (const criterion of value.acceptanceCriteria) {
      for (const id of criterion.requirementIds) {
        if (!requirementIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: `Acceptance Criteria가 존재하지 않는 요구사항을 참조합니다: ${id}`,
            path: ["acceptanceCriteria", criterion.id, "requirementIds"],
          });
        }
      }
    }
    if (value.api.required && value.api.endpoints.length === 0) {
      context.addIssue({
        code: "custom",
        message: "API가 필요하면 endpoint를 하나 이상 정의해야 합니다.",
        path: ["api", "endpoints"],
      });
    }
  });

export const prdJsonSchema = androidBuildReadyPrdSchema;
export const androidBuildReadyPrdJsonSchema = z.toJSONSchema(androidBuildReadyPrdSchema, {
  target: "draft-2020-12",
  unrepresentable: "any",
});

export type AndroidBuildReadyPrd = z.infer<typeof androidBuildReadyPrdSchema>;
export type PrdJson = AndroidBuildReadyPrd;

export function flattenPrdAcceptanceCriteria(prd: AndroidBuildReadyPrd): string[] {
  return prd.acceptanceCriteria.map(
    (criterion) =>
      `${criterion.id} | ${criterion.title} | Given ${criterion.given} | When ${criterion.when} | Then ${criterion.then} | Verify ${criterion.verification}`,
  );
}

export const requiredBuildReadyMarkdownHeadings = [
  "문서 메타데이터",
  "제품 정의",
  "출시 범위",
  "사용자 여정",
  "화면 명세",
  "기능 요구사항",
  "데이터 명세",
  "API 명세",
  "Android 기술 기준",
  "권한",
  "보안",
  "개인정보",
  "디자인",
  "빌드",
  "테스트",
  "Acceptance Criteria",
  "Release Gate",
  "가정 및 미결정 사항",
  "위험",
] as const;

export const androidBuildReadyPrdMarkdownTemplate = `# Android Build-ready PRD

## 문서 메타데이터
- Schema: ${androidBuildReadyPrdSchemaVersion}
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
`;
