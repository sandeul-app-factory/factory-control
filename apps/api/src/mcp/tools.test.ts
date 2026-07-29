import { describe, expect, it } from "vitest";
import { mcpTools } from "./tools.js";

describe("MCP tool exposure", () => {
  it("exposes only the approved domain allowlist", () => {
    expect(mcpTools.map((tool) => tool.name)).toEqual([
      "factory.get_prd_schema",
      "factory.list_projects",
      "factory.get_project",
      "factory.get_project_status",
      "factory.list_artifacts",
      "factory.read_artifact",
      "factory.create_project",
      "factory.upload_prd",
      "factory.create_prd_version",
      "factory.record_ceo_constraint",
      "factory.record_decision",
      "factory.request_prd_review",
    ]);
  });

  it("never exposes generic or high-risk operations", () => {
    const names = mcpTools.map((tool) => tool.name).join(" ");
    expect(names).not.toMatch(/shell|sql|delete|merge|sign|rotate/i);
    expect(mcpTools.every((tool) => tool.annotations.destructiveHint === false)).toBe(true);
  });
});
