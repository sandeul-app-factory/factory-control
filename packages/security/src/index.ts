import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const sensitiveKeyPattern =
  /authorization|cookie|password|secret|token|private.?key|session|credential|keystore/i;

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : redact(item),
      ]),
    );
  }
  return value;
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return false;
  }
  return allowedOrigins.some((allowed) => {
    try {
      return new URL(origin).origin === new URL(allowed).origin;
    } catch {
      return false;
    }
  });
}

export interface ReleaseGateInput {
  lockedPrd: boolean;
  commitMatches: boolean;
  prdHashMatches: boolean;
  testStatus: string;
  testFailures: number;
  acceptanceCriteriaMet: boolean;
  securityStatus: string;
  openCritical: number;
  openHigh: number;
  sbomPresent: boolean;
  buildStatus: string;
  buildArtifactPresent: boolean;
  buildArtifactHashMatches: boolean;
}

export interface ReleaseGateReport {
  passed: boolean;
  blockers: string[];
  checks: Record<string, boolean>;
}

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateReport {
  const checks = {
    lockedPrd: input.lockedPrd,
    commitMatches: input.commitMatches,
    prdHashMatches: input.prdHashMatches,
    testsPassed: input.testStatus === "PASSED" && input.testFailures === 0,
    acceptanceCriteriaMet: input.acceptanceCriteriaMet,
    securityScanPassed: input.securityStatus === "PASSED",
    noCriticalFindings: input.openCritical === 0,
    noHighFindings: input.openHigh === 0,
    sbomPresent: input.sbomPresent,
    buildSucceeded: input.buildStatus === "SUCCEEDED",
    buildArtifactVerified: input.buildArtifactPresent && input.buildArtifactHashMatches,
  };
  const messages: Record<keyof typeof checks, string> = {
    lockedPrd: "잠긴 PRD가 없습니다.",
    commitMatches: "테스트·보안검사·빌드의 Commit SHA가 일치하지 않습니다.",
    prdHashMatches: "빌드의 PRD SHA-256이 현재 잠긴 PRD와 일치하지 않습니다.",
    testsPassed: "테스트가 실패했거나 완료되지 않았습니다.",
    acceptanceCriteriaMet: "PRD Acceptance Criteria 충족이 확인되지 않았습니다.",
    securityScanPassed: "보안검사가 실패했거나 완료되지 않았습니다.",
    noCriticalFindings: "미해결 CRITICAL Finding이 있습니다.",
    noHighFindings: "수용되지 않은 HIGH Finding이 있습니다.",
    sbomPresent: "SBOM이 생성되지 않았습니다.",
    buildSucceeded: "빌드가 실패했거나 완료되지 않았습니다.",
    buildArtifactVerified: "빌드 Artifact와 SHA-256을 확인할 수 없습니다.",
  };
  const blockers = (Object.keys(checks) as Array<keyof typeof checks>)
    .filter((key) => !checks[key])
    .map((key) => messages[key]);
  return { passed: blockers.length === 0, blockers, checks };
}

export * from "./android.js";
