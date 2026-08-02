import { describe, expect, it } from "vitest";
import { artifactObjectKey, normalizeUploadFilename, validateUpload } from "./index.js";

describe("upload validation", () => {
  it("accepts canonical markdown and hashes it", async () => {
    const result = await validateUpload(
      Buffer.from("# PRD\n\n내용"),
      "product.md",
      "text/markdown",
      1024,
    );
    expect(result.extension).toBe(".md");
    expect(result.sha256).toHaveLength(64);
  });

  it("rejects path traversal filenames", async () => {
    await expect(
      validateUpload(Buffer.from("{}"), "../prd.json", "application/json", 1024),
    ).rejects.toThrow("안전하지 않은 파일명");
  });

  it("restores UTF-8 multipart filenames decoded as latin1", () => {
    const multipartName = Buffer.from("01_메모작성.png", "utf8").toString("latin1");
    expect(normalizeUploadFilename(multipartName)).toBe("01_메모작성.png");
    expect(normalizeUploadFilename("café.png")).toBe("café.png");
  });

  it("uses project and artifact versions in the object key", () => {
    const key = artifactObjectKey(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      3,
      "abc",
    );
    expect(key).toContain("/v3/abc");
  });
});
