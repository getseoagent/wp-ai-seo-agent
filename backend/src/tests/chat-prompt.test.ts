import { describe, expect, it } from "bun:test";
import { CHAT_SYSTEM_PROMPT } from "../lib/chat-prompt";

describe("CHAT_SYSTEM_PROMPT", () => {
  it("mentions surfacing job_id", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/job_id/);
  });

  it("mentions sample-and-extrapolate flow", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/sample/i);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/list_posts/);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/propose_seo_rewrites/);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/apply_style_to_batch/);
  });

  it("is short — under 2000 chars", () => {
    expect(CHAT_SYSTEM_PROMPT.length).toBeLessThan(2000);
  });

  it("forbids update_seo_fields per-post for multi-post requests", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/Do NOT loop update_seo_fields per-post/);
  });

  it("requires bulk pipeline for any multi-post request", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/Multi-post requests ALWAYS use the bulk pipeline/);
  });

  it("includes speed audit conventions", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/audit_url_speed/);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/Core Web Vitals/);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/SpeedAuditCard/);
  });
});
