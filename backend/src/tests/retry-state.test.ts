import { describe, it, expect } from "bun:test";
import { nextChargeDelayDays, shouldGiveUp, maxRetries } from "../lib/billing/retry-state";

describe("retry-state", () => {
  it("[1d, 3d, 7d] schedule indexed by current retry_count", () => {
    expect(nextChargeDelayDays(0)).toBe(1);
    expect(nextChargeDelayDays(1)).toBe(3);
    expect(nextChargeDelayDays(2)).toBe(7);
  });

  it("returns null past the schedule", () => {
    expect(nextChargeDelayDays(3)).toBeNull();
    expect(nextChargeDelayDays(99)).toBeNull();
    expect(nextChargeDelayDays(-1)).toBeNull();
  });

  it("shouldGiveUp flips at MAX_RETRIES (3) — applied to the POST-increment count", () => {
    expect(shouldGiveUp(0)).toBe(false);
    expect(shouldGiveUp(1)).toBe(false);
    expect(shouldGiveUp(2)).toBe(false);
    expect(shouldGiveUp(3)).toBe(true);
    expect(shouldGiveUp(4)).toBe(true);
  });

  it("maxRetries reports 3", () => {
    expect(maxRetries()).toBe(3);
  });
});
