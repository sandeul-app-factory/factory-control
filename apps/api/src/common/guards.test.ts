import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "@sandeul/security";

describe("authorization foundations", () => {
  it("does not trust lookalike origins", () => {
    expect(
      isAllowedOrigin("https://factory.sandeul.work.attacker.example", [
        "https://factory.sandeul.work",
      ]),
    ).toBe(false);
  });
});
