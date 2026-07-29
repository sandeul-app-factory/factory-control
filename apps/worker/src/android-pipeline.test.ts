import { describe, expect, it, vi } from "vitest";
import { validateUpload } from "@sandeul/storage";
import { runAndroidPipeline } from "./android-pipeline.js";

describe("Android quality pipeline", () => {
  it("produces independently recordable fake test, security, SBOM, and APK results", async () => {
    const onEvent = vi.fn(() => Promise.resolve());
    const result = await runAndroidPipeline({
      repositoryPath: "unused",
      outputDirectory: "unused",
      fake: true,
      signal: new AbortController().signal,
      onEvent,
    });

    expect(result.testStatus).toBe("PASSED");
    expect(result.securityStatus).toBe("PASSED");
    expect(result.buildStatus).toBe("SUCCEEDED");
    expect(result.sbom?.name).toMatch(/spdx\.json$/);
    expect(result.buildArtifact?.name).toMatch(/\.apk$/);
    expect(result.steps.some((step) => step.suite === "TEST")).toBe(true);
    expect(result.steps.some((step) => step.suite === "SECURITY")).toBe(true);
    expect(result.steps.some((step) => step.suite === "BUILD")).toBe(true);

    const artifact = result.buildArtifact!;
    const validated = await validateUpload(
      artifact.buffer,
      artifact.name,
      artifact.mimeType,
      1_000_000,
    );
    expect(validated.sha256).toBe(artifact.sha256);
    expect(onEvent).toHaveBeenCalledWith(
      "pipeline.fake",
      "Fake 독립 테스트·보안검사·빌드를 실행했습니다.",
    );
  });
});
