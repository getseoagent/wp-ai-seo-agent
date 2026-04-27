import { describe, expect, it } from "vitest";
import { formatBulkSummary } from "./format-bulk-summary";

describe("formatBulkSummary — apply mode", () => {
  it("formats applied/failed/skipped counts", () => {
    const out = formatBulkSummary({
      job_id: "abc", status: "completed", total: 10,
      applied: 7, failed: 2, skipped: 1, duration_ms: 1234,
      results: [
        { post_id: 1, status: "applied", title_before: "old", title_after: "new" },
        { post_id: 2, status: "failed", reason: "api_error" },
        { post_id: 3, status: "skipped", reason: "post_not_found" },
      ],
    });
    expect(out.mode).toBe("apply");
    expect(out.jobId).toBe("abc");
    expect(out.headline).toContain("7");
    expect(out.headline).toContain("2");
    expect(out.headline).toContain("1");
    expect(out.rows).toHaveLength(3);
    expect(out.canRollback).toBe(true);
  });

  it("disables rollback when applied is zero", () => {
    const out = formatBulkSummary({
      job_id: "abc", status: "completed", total: 5, applied: 0, failed: 5, skipped: 0,
      duration_ms: 100, results: [],
    });
    expect(out.canRollback).toBe(false);
  });

  it("flags cancelled status", () => {
    const out = formatBulkSummary({
      job_id: "abc", status: "cancelled", total: 10, applied: 3, failed: 0, skipped: 7,
      duration_ms: 100, results: [],
    });
    expect(out.statusBadge).toMatch(/cancel/i);
  });
});

describe("formatBulkSummary — rollback mode", () => {
  it("formats rolled_back count from results", () => {
    const out = formatBulkSummary({
      job_id: "rb-1",
      results: [
        { history_id: 1, status: "rolled_back" },
        { history_id: 2, status: "rolled_back" },
        { history_id: 3, status: "skipped", reason: "already rolled back" },
      ],
    });
    expect(out.mode).toBe("rollback");
    expect(out.headline).toContain("2");  // 2 rolled back
    expect(out.canRollback).toBe(false);
  });
});
