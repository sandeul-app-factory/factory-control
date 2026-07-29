import { createHash } from "node:crypto";

export interface AndroidSecurityFinding {
  fingerprint: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  ruleId: string;
  title: string;
  description: string;
  remediation: string;
}

function finding(
  severity: AndroidSecurityFinding["severity"],
  ruleId: string,
  title: string,
  description: string,
  remediation: string,
): AndroidSecurityFinding {
  return {
    fingerprint: createHash("sha256").update(`${ruleId}:${description}`).digest("hex").slice(0, 48),
    severity,
    ruleId,
    title,
    description,
    remediation,
  };
}

export function inspectAndroidManifest(source: string): AndroidSecurityFinding[] {
  const findings: AndroidSecurityFinding[] = [];
  if (/\bandroid:debuggable\s*=\s*["']true["']/i.test(source)) {
    findings.push(
      finding(
        "HIGH",
        "ANDROID-DEBUGGABLE",
        "Release Manifest에서 debuggable이 활성화됨",
        'android:debuggable="true"가 발견되었습니다.',
        "Release variant에서 debuggable을 비활성화하세요.",
      ),
    );
  }
  if (!/\bandroid:allowBackup\s*=\s*["']false["']/i.test(source)) {
    findings.push(
      finding(
        "MEDIUM",
        "ANDROID-BACKUP",
        "백업 정책이 명시적으로 차단되지 않음",
        'Application에 android:allowBackup="false"가 명시되지 않았습니다.',
        "민감 데이터가 있다면 backup/dataExtractionRules와 allowBackup을 명시하세요.",
      ),
    );
  }
  if (/\bandroid:usesCleartextTraffic\s*=\s*["']true["']/i.test(source)) {
    findings.push(
      finding(
        "HIGH",
        "ANDROID-CLEARTEXT",
        "평문 네트워크 트래픽 허용",
        'android:usesCleartextTraffic="true"가 발견되었습니다.',
        "평문 트래픽을 금지하고 필요한 예외만 Network Security Config로 제한하세요.",
      ),
    );
  }
  const componentPattern =
    /<(activity|activity-alias|service|receiver|provider)\b(?:(?!<\/?\1\b)[\s\S])*?>/gi;
  for (const match of source.matchAll(componentPattern)) {
    const declaration = match[0];
    const hasIntentFilter = /<intent-filter\b/i.test(declaration);
    const exported = /\bandroid:exported\s*=\s*["']true["']/i.test(declaration);
    if (exported || (hasIntentFilter && !/\bandroid:exported\s*=/i.test(declaration))) {
      findings.push(
        finding(
          "HIGH",
          "ANDROID-EXPORTED-COMPONENT",
          "외부 노출 Android Component 검토 필요",
          declaration.slice(0, 500),
          "exported=false를 기본값으로 하고, 필요한 Component는 permission과 입력 검증을 적용하세요.",
        ),
      );
    }
  }
  return findings;
}

export function inspectAndroidSource(source: string): AndroidSecurityFinding[] {
  const rules: Array<{
    pattern: RegExp;
    severity: AndroidSecurityFinding["severity"];
    ruleId: string;
    title: string;
    remediation: string;
  }> = [
    {
      pattern: /\bonReceivedSslError\s*\([^)]*\)[\s\S]{0,1000}\.proceed\s*\(/i,
      severity: "CRITICAL",
      ruleId: "ANDROID-TLS-PROCEED",
      title: "WebView TLS 오류 무시",
      remediation: "SslErrorHandler.proceed()를 제거하고 TLS 오류를 차단하세요.",
    },
    {
      pattern: /\bsetHostnameVerifier\s*\([^)]*(?:ALLOW_ALL|return\s+true)/i,
      severity: "CRITICAL",
      ruleId: "ANDROID-HOSTNAME-BYPASS",
      title: "Hostname 검증 우회",
      remediation: "플랫폼 기본 HostnameVerifier를 사용하세요.",
    },
    {
      pattern: /\bsetAllowUniversalAccessFromFileURLs\s*\(\s*true\s*\)/i,
      severity: "HIGH",
      ruleId: "ANDROID-WEBVIEW-UNIVERSAL-FILE",
      title: "WebView universal file URL 접근 허용",
      remediation: "Universal file URL 접근을 비활성화하세요.",
    },
    {
      pattern: /\baddJavascriptInterface\s*\(/i,
      severity: "HIGH",
      ruleId: "ANDROID-WEBVIEW-JS-BRIDGE",
      title: "WebView JavaScript Bridge 사용",
      remediation: "신뢰된 콘텐츠에만 최소 Bridge를 노출하고 origin과 API level을 검증하세요.",
    },
    {
      pattern: /\bsetJavaScriptEnabled\s*\(\s*true\s*\)/i,
      severity: "MEDIUM",
      ruleId: "ANDROID-WEBVIEW-JAVASCRIPT",
      title: "WebView JavaScript 활성화",
      remediation:
        "필요하지 않으면 비활성화하고, 필요한 경우 navigation/origin allowlist를 적용하세요.",
    },
    {
      pattern: /(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'][^"']{12,}["']/i,
      severity: "CRITICAL",
      ruleId: "ANDROID-HARDCODED-SECRET",
      title: "하드코딩된 Secret 의심값",
      remediation:
        "Secret을 코드에서 제거하고 서버 측 자격 증명 또는 안전한 런타임 구성을 사용하세요.",
    },
  ];
  return rules
    .filter((rule) => rule.pattern.test(source))
    .map((rule) =>
      finding(
        rule.severity,
        rule.ruleId,
        rule.title,
        `정적 패턴 ${rule.ruleId}가 소스에서 발견되었습니다.`,
        rule.remediation,
      ),
    );
}
