import { describe, expect, it } from "vitest";
import { isAllowedOrigin, redact, safeEqual, sha256 } from "./index.js";

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
});
