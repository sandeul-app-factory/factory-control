import { describe, expect, it } from "vitest";
import { assertProjectTransition, canTransitionProject } from "./state-machine.js";

describe("project state machine", () => {
  it("allows documented forward transitions", () => {
    expect(canTransitionProject("PRD_APPROVED", "PRD_LOCKED")).toBe(true);
    expect(canTransitionProject("PRD_DRAFT", "PRD_LOCKED")).toBe(true);
    expect(canTransitionProject("SECURITY_REVIEW", "RELEASE_CANDIDATE")).toBe(true);
  });

  it("rejects arbitrary jumps", () => {
    expect(canTransitionProject("IDEA", "RELEASED")).toBe(false);
    expect(() => assertProjectTransition("PRD_DRAFT", "SIGNED")).toThrow(
      "허용되지 않은 프로젝트 상태 전환",
    );
  });

  it("makes archived terminal", () => {
    expect(canTransitionProject("ARCHIVED", "IDEA")).toBe(false);
  });
});
