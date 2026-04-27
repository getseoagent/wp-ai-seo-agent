import type { WpClient } from "./wp-client";
import { CraftError, type CraftDeps, type RewriteProposal, type RewriteFailure } from "./craft";
import type { SseEvent } from "./sse";
import { runBulkJob, type BulkApplyResult } from "./job-runner";

export type Tool = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
};

export const tools: Tool[] = [
  {
    name: "list_posts",
    description: "List WordPress posts (or pages or any post type) with optional category/tag/date/slug filters. Default post_type is 'post'; pass 'page' for pages or 'any' for everything. Returns id, post_title, slug, status, modified.",
    input_schema: {
      type: "object",
      properties: {
        post_type: { type: "string", description: "Post type: 'post' (default), 'page', 'any', or any custom post type slug" },
        category:  { type: "string", description: "Category slug (post_type=post only)" },
        tag:       { type: "string", description: "Tag slug (post_type=post only)" },
        status:    { type: "string", description: "Post status, default 'publish'" },
        after:     { type: "string", description: "Only items modified after this ISO date (e.g. '2026-01-01')" },
        before:    { type: "string", description: "Only items modified before this ISO date" },
        slugs:     { type: "array", items: { type: "string" }, description: "Fetch only items whose slug is in this list (e.g. extracted from a list of URLs)" },
        limit:     { type: "integer", description: "Max items, default 20, max 50" },
        cursor:    { type: "integer", description: "Offset for pagination" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_post_summary",
    description: "Get one post's title, slug, word count, and current SEO meta (title/description/focus_keyword/og_title).",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer", description: "Post ID" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_categories",
    description: "List all post categories with id/name/slug/count.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_tags",
    description: "List all post tags with id/name/slug/count.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "detect_seo_plugin",
    description: "Identify the active SEO plugin: 'rank-math' or 'none'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_seo_fields",
    description: "Update one post's SEO meta. Pass only the fields you want to change. Empty string clears a field. Returns audit results with before/after per field.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "integer", description: "Post ID" },
        job_id:  { type: "string",  description: "Optional UUID for grouping related writes; auto-generated if omitted" },
        fields: {
          type: "object",
          properties: {
            title:         { type: "string" },
            description:   { type: "string" },
            focus_keyword: { type: "string" },
            og_title:      { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["post_id", "fields"],
      additionalProperties: false,
    },
  },
  {
    name: "get_history",
    description: "Read audit log entries filtered by post_id or job_id. At least one filter is required.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "integer" },
        job_id:  { type: "string" },
        limit:   { type: "integer", description: "Default 20, max 100" },
        cursor:  { type: "integer" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "rollback",
    description: "Reverse one or more prior writes by their history row ids. Each rollback is itself logged so the action is reversible.",
    input_schema: {
      type: "object",
      properties: { history_ids: { type: "array", items: { type: "integer" }, maxItems: 50 } },
      required: ["history_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_seo_rewrites",
    description: "Preview SEO rewrites for up to 20 posts. Returns proposals + failures. Read-only — does not modify anything in WordPress. Use when the user asks for a preview, draft, or rewrite suggestion.",
    input_schema: {
      type: "object",
      properties: {
        post_ids:    { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 20, description: "WordPress post IDs to propose rewrites for" },
        style_hints: { type: "string", maxLength: 1024, description: "Optional natural-language style guidance, e.g. 'more aggressive tone, no emojis, include the brand name'" },
      },
      required: ["post_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "apply_style_to_batch",
    description: "Apply approved SEO rewrite style to up to 200 posts. Creates a job, runs in parallel with concurrency 3, returns a summary with applied/failed/skipped counts. Use after the user has approved the style on a small sample via propose_seo_rewrites.",
    input_schema: {
      type: "object",
      properties: {
        post_ids:    { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 200, description: "WordPress post IDs to apply the rewrite to (1..200)" },
        style_hints: { type: "string", maxLength: 2048, description: "Style guidance approved by the user during sampling (e.g. 'aggressive tone, no emoji, brand WPilot')" },
      },
      required: ["post_ids", "style_hints"],
      additionalProperties: false,
    },
  },
];

export type SseEventEmitter = (ev: SseEvent) => void;

export async function dispatchTool(
  name: string,
  input: unknown,
  wp: WpClient,
  signal?: AbortSignal,
  craft?: CraftDeps,
  emit?: SseEventEmitter,
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "list_posts":        return wp.listPosts(args, signal);
    case "get_post_summary":  return wp.getPostSummary(Number(args.id), signal);
    case "get_categories":    return wp.getCategories(signal);
    case "get_tags":          return wp.getTags(signal);
    case "detect_seo_plugin": return wp.detectSeoPlugin(signal);
    case "update_seo_fields": return wp.updateSeoFields(Number(args.post_id), (args.fields ?? {}) as any, args.job_id as string | undefined, signal);
    case "get_history":       return wp.getHistory(args as any, signal);
    case "rollback":          return wp.rollback((args.history_ids ?? []) as number[], signal);
    case "propose_seo_rewrites": {
      const post_ids = args.post_ids;
      const style_hints = args.style_hints;
      if (!Array.isArray(post_ids) || post_ids.length === 0) {
        throw new Error("propose_seo_rewrites: post_ids required");
      }
      if (post_ids.length > 20) {
        return { error: "preview limit exceeded — for larger batches, use the bulk job (Plan 3c, not yet available)" };
      }
      if (!craft) {
        throw new Error("propose_seo_rewrites: craft deps required");
      }
      const ids = post_ids.map((v) => Number(v));
      const trimmedHints = typeof style_hints === "string" ? style_hints.slice(0, 1024) : "";

      const settled = await Promise.allSettled(ids.map(async (id) => {
        const summary = await wp.getPostSummary(id, signal);
        if (!summary) throw new CraftError("post_not_found", `post ${id} not found or not publish`);
        return craft.composeRewrite(summary, trimmedHints || undefined, signal);
      }));

      const proposals: RewriteProposal[] = [];
      const failures: RewriteFailure[]   = [];
      settled.forEach((res, i) => {
        if (res.status === "fulfilled") {
          proposals.push(res.value);
        } else {
          const err = res.reason instanceof CraftError ? res.reason : null;
          failures.push({
            post_id: ids[i],
            reason: err?.reason ?? "api_error",
            detail: err?.detail ?? String(res.reason),
          });
        }
      });
      return { proposals, failures };
    }
    case "apply_style_to_batch": {
      const { post_ids, style_hints } = (input ?? {}) as { post_ids?: unknown; style_hints?: unknown };
      if (!Array.isArray(post_ids) || post_ids.length === 0) {
        return { error: "post_ids required" };
      }
      if (post_ids.length > 200) {
        return { error: "batch limit exceeded (>200) — split into multiple apply calls" };
      }
      if (!craft) {
        throw new Error("apply_style_to_batch: craft deps required");
      }
      const ids = post_ids.map(v => Number(v));
      const trimmedHints = typeof style_hints === "string" ? style_hints.slice(0, 2048) : "";

      // Concurrent-job guard
      const existing = await wp.findRunningJobForUser(0, signal);
      if (existing) {
        return { error: `another bulk job is already running (job_id: ${existing.id})` };
      }

      // Create job in DB
      const jobId = (typeof globalThis.crypto?.randomUUID === "function")
        ? globalThis.crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await wp.createJob({
        id: jobId,
        user_id: 0,
        tool_name: "apply_style_to_batch",
        total: ids.length,
        style_hints: trimmedHints,
        params_json: JSON.stringify({ post_ids: ids }),
      }, signal);

      // No emit? Use a no-op fallback (shouldn't happen in production)
      const safeEmit = emit ?? (() => {});

      const result: BulkApplyResult = await runBulkJob({
        jobId, postIds: ids, styleHints: trimmedHints,
        wp, craft, signal: signal ?? new AbortController().signal,
        emit: safeEmit,
      });
      return result;
    }
    default: throw new Error(`unknown tool: ${name}`);
  }
}
