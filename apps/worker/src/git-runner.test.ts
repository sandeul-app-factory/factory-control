import { describe, expect, it } from "vitest";
import {
  changedPaths,
  enforcePathPolicy,
  validateGithubUrl,
  validateGitRef,
} from "./git-runner.js";

describe("worker Git boundary", () => {
  it("allows only GitHub HTTPS clone URLs and safe refs", () => {
    expect(validateGithubUrl("https://github.com/sandeul/app")).toBe(
      "https://github.com/sandeul/app.git",
    );
    expect(() => validateGithubUrl("https://127.0.0.1/internal")).toThrow();
    expect(() => validateGitRef("../main")).toThrow();
    expect(() => validateGitRef("-c")).toThrow();
    expect(() => validateGitRef("factory/task-1")).not.toThrow();
  });

  it("parses status and blocks denied/out-of-scope files", () => {
    expect(changedPaths(" M app/Main.kt\0?? docs/readme.md\0")).toEqual([
      "app/Main.kt",
      "docs/readme.md",
    ]);
    expect(() =>
      enforcePathPolicy(["app/Main.kt"], ["app/**"], [".env", "**/*.jks"]),
    ).not.toThrow();
    expect(() => enforcePathPolicy(["release/key.jks"], ["**"], ["**/*.jks"])).toThrow();
    expect(() => enforcePathPolicy(["infra/prod.yml"], ["app/**"], [])).toThrow();
  });
});
