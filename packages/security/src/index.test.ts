import { describe, expect, it } from "vitest";
import { evaluateReleaseGate, isAllowedOrigin, redact, safeEqual, sha256 } from "./index.js";

describe("security primitives", () => {
  it("hashes deterministically and compares in constant-time helper", () => {
    expect(sha256("factory")).toHaveLength(64);
    expect(safeEqual("same", "same")).toBe(true);
    expect(safeEqual("same", "different")).toBe(false);
  });

  it("redacts nested secrets", () => {
    expect(redact({ email: "ceo@example.com", nested: { accessToken: "secret" } })).toEqual({
      email: "ceo@example.com",
      nested: { accessToken: "[REDACTED]" },
    });
  });

  it("compares normalized origins", () => {
    expect(isAllowedOrigin("https://factory.sandeul.work", ["https://factory.sandeul.work/"])).toBe(
      true,
    );
  });

  it("blocks a release when a high finding is still open", () => {
    const result = evaluateReleaseGate({
      lockedPrd: true,
      commitMatches: true,
      prdHashMatches: true,
      testStatus: "PASSED",
      testFailures: 0,
      acceptanceCriteriaMet: true,
      securityStatus: "PASSED",
      openCritical: 0,
      openHigh: 1,
      sbomPresent: true,
      buildStatus: "SUCCEEDED",
      buildArtifactPresent: true,
      buildArtifactHashMatches: true,
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain("수용되지 않은 HIGH Finding이 있습니다.");
  });

  it("passes only when every immutable release input is verified", () => {
    expect(
      evaluateReleaseGate({
        lockedPrd: true,
        commitMatches: true,
        prdHashMatches: true,
        testStatus: "PASSED",
        testFailures: 0,
        acceptanceCriteriaMet: true,
        securityStatus: "PASSED",
        openCritical: 0,
        openHigh: 0,
        sbomPresent: true,
        buildStatus: "SUCCEEDED",
        buildArtifactPresent: true,
        buildArtifactHashMatches: true,
      }).passed,
    ).toBe(true);
  });
});
