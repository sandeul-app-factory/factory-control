import { describe, expect, it } from "vitest";
import {
  androidBuildReadyPrdSchema,
  fixedProductOwners,
  flattenPrdAcceptanceCriteria,
} from "./prd.js";

function validPrd() {
  return {
    schemaVersion: "android-build-ready/v1",
    metadata: {
      title: "산들 예제 앱",
      documentVersion: "1.0.0",
      owners: ["산들", "수빈"],
      productType: "ANDROID_APP",
      status: "DRAFT",
      lastUpdatedAt: "2026-07-29T00:00:00.000Z",
      targetRelease: "MVP",
    },
    product: {
      summary: "한 문장 제품 설명",
      problem: "사용자가 해결하려는 구체적인 문제",
      valueProposition: "제품이 제공하는 핵심 가치",
      targetUsers: [
        {
          id: "USR-001",
          segment: "핵심 사용자",
          need: "빠르고 안전한 작업 완료",
          usageContext: "모바일 환경",
        },
      ],
      goals: [
        {
          id: "GOAL-001",
          description: "핵심 작업 완료",
          metric: "완료율",
          target: "95% 이상",
        },
      ],
      nonGoals: ["관리자 웹 구현"],
      revenueModel: "무료 MVP",
      successMetrics: ["크래시 없는 세션 99% 이상"],
    },
    releaseScope: {
      mustHave: [
        {
          id: "FEAT-001",
          name: "핵심 기능",
          description: "사용자가 핵심 작업을 완료한다.",
          priority: "MUST",
        },
      ],
      shouldHave: [],
      outOfScope: ["결제"],
      futureScope: ["다국어 확대"],
    },
    userJourneys: [
      {
        id: "UJ-001",
        title: "핵심 작업",
        actor: "USR-001",
        preconditions: ["앱이 설치되어 있다."],
        steps: ["앱을 연다.", "핵심 액션을 실행한다."],
        successOutcome: "결과가 저장된다.",
        failureScenarios: ["저장 실패 시 재시도 안내를 표시한다."],
      },
    ],
    screens: [
      {
        id: "SCR-001",
        name: "홈",
        route: "/home",
        purpose: "핵심 액션 제공",
        entryConditions: ["앱 실행"],
        components: ["상태 카드", "실행 버튼"],
        actions: ["실행 버튼 탭"],
        states: ["INITIAL", "LOADING", "CONTENT", "EMPTY", "ERROR", "OFFLINE"],
        errorHandling: ["복구 가능한 오류와 재시도 버튼을 표시한다."],
        accessibility: ["버튼에 한국어 contentDescription을 제공한다."],
        nextScreens: [],
      },
    ],
    functionalRequirements: [
      {
        id: "FR-001",
        featureId: "FEAT-001",
        title: "핵심 액션 실행",
        description: "사용자가 홈에서 핵심 액션을 실행한다.",
        inputs: ["사용자 탭"],
        businessRules: ["중복 실행을 차단한다."],
        outputs: ["성공 상태"],
        errors: ["실패 이유와 재시도 액션"],
        screenIds: ["SCR-001"],
      },
    ],
    data: {
      entities: [],
      localStorage: "민감하지 않은 UI 상태만 DataStore에 저장한다.",
      remoteSync: "원격 동기화를 사용하지 않는다.",
      migrationPolicy: "Schema 변경 시 명시적인 Migration을 추가한다.",
      deletionPolicy: "앱 데이터 삭제 시 로컬 데이터를 모두 제거한다.",
      offlinePolicy: "오프라인에서도 로컬 기능을 제공한다.",
    },
    api: {
      required: false,
      baseUrlPolicy: "API를 사용하지 않는다.",
      authentication: "해당 없음",
      endpoints: [],
      unavailableBackendStrategy: "해당 없음",
    },
    android: {
      applicationId: "work.sandeul.example",
      appName: "산들 예제",
      minSdk: 23,
      targetSdk: 36,
      compileSdk: 36,
      versionCode: 1,
      versionName: "1.0.0",
      javaToolchain: 17,
      language: "KOTLIN",
      uiFramework: "JETPACK_COMPOSE",
      architecture: "CLEAN_MVVM",
      dependencyInjection: "HILT",
      persistence: "DATASTORE",
      networkClient: "NONE",
      modules: [":app"],
      orientations: ["PORTRAIT"],
      locales: ["ko-KR"],
      theme: "SYSTEM",
    },
    permissions: [],
    security: {
      dataClassification: ["민감정보를 수집하지 않는다."],
      secretsPolicy: "Secret을 앱과 Repository에 저장하지 않는다.",
      networkSecurity: "TLS 검증 우회를 금지한다.",
      exportedComponents: ["Launcher Activity만 의도적으로 exported=true"],
      backupAllowed: false,
      releaseDebuggable: false,
      screenshotsAllowed: true,
      webView: {
        used: false,
        javascriptEnabled: false,
        allowedOrigins: [],
        fileAccessAllowed: false,
      },
      tlsValidationBypassAllowed: false,
    },
    privacy: {
      personalData: ["수집하지 않음"],
      consentFlow: "개인정보 수집 동의가 필요하지 않다.",
      retention: "개인정보를 보관하지 않는다.",
      deletion: "앱 데이터 삭제 기능을 제공한다.",
      privacyPolicyRequired: false,
    },
    design: {
      designSystem: "Material 3",
      colors: ["Primary #3F7D62", "Background #111827"],
      typography: ["Material 3 기본 Typography와 한국어 시스템 폰트"],
      iconArtifactIds: [],
      imageArtifactIds: [],
      missingAssetPolicy: "누락 Asset을 임의 생성하지 않고 작업을 차단한다.",
    },
    observability: {
      analyticsEvents: ["core_action_completed"],
      crashReporting: "Release에서 비식별 Crash 보고를 사용한다.",
      loggingPolicy: "개인정보와 Secret은 로그에 기록하지 않는다.",
      sensitiveFieldsExcluded: ["token", "password"],
    },
    build: {
      variants: ["debug", "release"],
      artifactTypes: ["APK", "AAB"],
      commands: {
        unitTest: "./gradlew test",
        lint: "./gradlew lint",
        staticAnalysis: ["./gradlew detekt", "./gradlew ktlintCheck"],
        debugApk: "./gradlew assembleDebug",
        releaseBundle: "./gradlew bundleRelease",
      },
      signing: "UNSIGNED_OR_DEBUG_ONLY",
      reproducibility: "Gradle Wrapper와 Version Catalog 버전을 고정한다.",
    },
    testPlan: {
      unit: ["핵심 상태 전이"],
      ui: ["홈의 모든 UI 상태"],
      integration: ["DataStore 저장과 복구"],
      accessibility: ["TalkBack label과 터치 영역"],
      offlineAndRecovery: ["오프라인 실행과 프로세스 재시작"],
      deviceMatrix: ["API 23", "API 36"],
    },
    acceptanceCriteria: [
      {
        id: "AC-001",
        requirementIds: ["FR-001"],
        title: "핵심 액션 완료",
        given: "홈 화면이 CONTENT 상태일 때",
        when: "사용자가 실행 버튼을 한 번 탭하면",
        then: "중복 실행 없이 성공 상태와 결과가 표시된다.",
        verification: "Unit test와 Compose UI test",
        mandatory: true,
      },
    ],
    releaseGates: {
      allTestsPass: true,
      acceptanceCriteriaMet: true,
      criticalFindingsAllowed: 0,
      highFindingsAllowed: 0,
      sbomRequired: true,
      installSmokeTestRequired: true,
      artifactSha256Required: true,
    },
    assumptions: ["Play Store 계정 설정은 Factory 외부 작업이다."],
    openQuestions: [],
    risks: [
      {
        id: "RSK-001",
        category: "STORE",
        description: "스토어 정책 검토가 지연될 수 있다.",
        impact: "MEDIUM",
        mitigation: "출시 전 정책 체크리스트를 검토한다.",
      },
    ],
  };
}

describe("Android Build-ready PRD", () => {
  it("accepts a complete build-ready document and flattens verifiable criteria", () => {
    const parsed = androidBuildReadyPrdSchema.parse(validPrd());
    expect(parsed.metadata.owners).toEqual(fixedProductOwners);
    expect(flattenPrdAcceptanceCriteria(parsed)[0]).toContain("AC-001");
  });

  it("rejects changed owners and dangling requirement references", () => {
    const changed = validPrd();
    changed.metadata.owners = ["다른 담당자", "수빈"];
    changed.acceptanceCriteria[0]!.requirementIds = ["FR-999"];
    expect(androidBuildReadyPrdSchema.safeParse(changed).success).toBe(false);
  });
});
