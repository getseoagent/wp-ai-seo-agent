import { describe, expect, it } from "bun:test";
import { CRAFT_SYSTEM_PROMPT, buildUserMessage } from "../lib/craft-prompt";
import type { PostSummary } from "../lib/wp-client";

const summary: PostSummary = {
  id: 42, post_title: "Long tail keywords", slug: "long-tail-keywords",
  status: "publish", modified: "2026-01-01 00:00:00", word_count: 800,
  content_preview: "A guide to long tail keywords for SEO. Lower volume, higher intent.",
  current_seo: { title: null, description: null, focus_keyword: null, og_title: null },
};

describe("CRAFT_SYSTEM_PROMPT", () => {
  it("includes the 9 craft steps and length rules", () => {
    expect(CRAFT_SYSTEM_PROMPT).toContain("classify intent");
    expect(CRAFT_SYSTEM_PROMPT).toContain("primary keyword");
    expect(CRAFT_SYSTEM_PROMPT).toContain("60");
    expect(CRAFT_SYSTEM_PROMPT).toContain("155");
    expect(CRAFT_SYSTEM_PROMPT).toContain("JSON");
    expect(CRAFT_SYSTEM_PROMPT).toContain("post_content");
  });

  it("is non-trivial in size (~3KB)", () => {
    expect(CRAFT_SYSTEM_PROMPT.length).toBeGreaterThan(2000);
    expect(CRAFT_SYSTEM_PROMPT.length).toBeLessThan(6000);
  });
});

describe("buildUserMessage", () => {
  it("wraps post fields in tagged blocks", () => {
    const msg = buildUserMessage(summary, undefined);
    expect(msg).toContain("<post>");
    expect(msg).toContain("<id>42</id>");
    expect(msg).toContain("<post_title>Long tail keywords</post_title>");
    expect(msg).toContain("<post_content>");
    expect(msg).toContain("A guide to long tail keywords");
    expect(msg).toContain("</post>");
  });

  it("includes <additional_constraints> when styleHints present", () => {
    const msg = buildUserMessage(summary, "more aggressive, no emoji");
    expect(msg).toContain("<additional_constraints>");
    expect(msg).toContain("more aggressive, no emoji");
    expect(msg).toContain("</additional_constraints>");
  });

  it("omits <additional_constraints> when styleHints absent", () => {
    const msg = buildUserMessage(summary, undefined);
    expect(msg).not.toContain("<additional_constraints>");
  });

  it("escapes XML-special chars in content", () => {
    const dangerous: PostSummary = {
      ...summary,
      content_preview: "Use <script>alert(1)</script> & avoid </post> markers",
    };
    const msg = buildUserMessage(dangerous, undefined);
    expect(msg).not.toContain("<script>");
    expect(msg).not.toContain("</post> markers");
    expect(msg).toContain("&lt;script&gt;");
    expect(msg).toContain("&lt;/post&gt;");
  });
});
