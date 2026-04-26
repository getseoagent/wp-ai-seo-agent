import { describe, expect, it } from "bun:test";
import { CraftError } from "../lib/craft";

describe("CraftError", () => {
  it("carries reason and detail", () => {
    const err = new CraftError("invalid_json", "model returned non-JSON");
    expect(err.reason).toBe("invalid_json");
    expect(err.detail).toBe("model returned non-JSON");
    expect(err.message).toBe("model returned non-JSON");
    expect(err).toBeInstanceOf(Error);
  });

  it("supports all reason variants", () => {
    const reasons = ["invalid_json", "length_violation", "api_error", "post_not_found"] as const;
    reasons.forEach(r => {
      const e = new CraftError(r, "x");
      expect(e.reason).toBe(r);
    });
  });
});
