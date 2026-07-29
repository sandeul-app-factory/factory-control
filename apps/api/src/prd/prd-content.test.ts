import { describe, expect, it } from "vitest";
import {
  jsonSections,
  latestByLogicalId,
  markdownSections,
  parseStringArray,
} from "./prd-content.js";

describe("PRD canonical content", () => {
  it("splits Markdown into stable, hashed sections", () => {
    const sections = markdownSections("# 목표\n안전한 공장\n\n## 범위\nMVP");
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ heading: "목표", anchor: "목표-1", ordinal: 0 });
    expect(sections[0]?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates sections from structured JSON", () => {
    const sections = jsonSections({ title: "Factory", acceptanceCriteria: ["로그인"] });
    expect(sections.map((section) => section.heading)).toEqual(["title", "acceptanceCriteria"]);
  });

  it("rejects malformed string arrays and keeps only the latest logical version", () => {
    expect(parseStringArray('[" A ", ""]', "criteria")).toEqual(["A"]);
    expect(() => parseStringArray('{"not":"an array"}', "criteria")).toThrow();
    expect(
      latestByLogicalId([
        { logicalId: "a", version: 2 },
        { logicalId: "a", version: 1 },
        { logicalId: "b", version: 1 },
      ]),
    ).toEqual([
      { logicalId: "a", version: 2 },
      { logicalId: "b", version: 1 },
    ]);
  });
});
