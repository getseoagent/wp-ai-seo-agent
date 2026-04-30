import type { WpClient } from "./wp-client";
import { CraftError, type CraftDeps, type RewriteProposal, type RewriteFailure } from "./craft";
import type { SseEvent } from "./sse";
import { runBulkJob, type BulkApplyResult } from "./job-runner";
import { type Tier } from "./license/key-format";
import { tierAllows } from "./license/tier-gate";

export type Tool = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  /**
   * If true, runAgent dispatches this tool concurrently (Promise.allSettled) when
   * multiple tool_uses appear in the same turn. Read-only / idempotent tools only —
   * never set on tools with WP write side-effects, audit ordering requirements,
   * or concurrent-job guards.
   */
  concurrent?: boolean;
};

export const tools: Tool[] = [
  {
    name: "list_posts",
    description: "List WordPress posts (or pages or any post type) with optional category/tag/date/slug filters. Default post_type is 'post'; pass 'page' for pages or 'any' for everything. Returns id, post_title, slug, status, modified.",
    concurrent: true,
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
    concurrent: true,
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
    concurrent: true,
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
    concurrent: true,
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
    description: "Reverse one or more prior writes by their history row ids, OR roll back all writes belonging to a bulk job. Each rollback is itself logged so the action is reversible.",
    input_schema: {
      type: "object",
      properties: {
        history_ids: { type: "array", items: { type: "integer" }, description: "Specific audit row IDs to roll back", maxItems: 50 },
        job_id: { type: "string", description: "UUID of a job — rolls back all its non-rolled-back rows in a transaction" },
      },
      // exactly one required — Anthropic's JSON schema doesn't enforce oneOf reliably, so we validate at dispatch
      additionalProperties: false,
    },
  },
  {
    name: "propose_seo_rewrites",
    description: "Preview SEO rewrites for up to 20 posts. Returns proposals + failures. Read-only — does not modify anything in WordPress. Use when the user asks for a preview, draft, or rewrite suggestion.",
    concurrent: true,
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
  {
    name: "cancel_job",
    description: "Request cancellation of a running bulk job. Idempotent. The currently in-flight posts complete; further posts are skipped.",
    input_schema: {
      type: "object",
      properties: { job_id: { type: "string", description: "UUID of the running job" } },
      required: ["job_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_job_status",
    description: "Get current state of a bulk job (running, completed, cancelled, failed, interrupted).",
    concurrent: true,
    input_schema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
      additionalProperties: false,
    },
  },
  {
    name: "audit_url_speed",
    description: "Run Google PageSpeed Insights for a URL on mobile (default) or desktop. Returns Lighthouse score, Core Web Vitals (LCP, CLS, INP, FCP, TTFB), top opportunities, and the LCP element if any. Read-only, cached for 60 minutes by (url, strategy). Pass nocache=true to bypass for re-audit after applying fixes.",
    concurrent: true,
    input_schema: {
      type: "object",
      properties: {
        url:      { type: "string",  description: "Public URL to audit (must be reachable from Google's PSI runners)" },
        strategy: { type: "string",  description: "'mobile' (default) or 'desktop'", enum: ["mobile", "desktop"] },
        nocache:  { type: "boolean", description: "Skip the 60-minute cache (use after applying fixes)" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_speed_fixes",
    description: "Given a PSI audit, the URL's WordPress template info, and detected optimizer plugins, produce a structured list of fixes the agent can apply (reachable[]) plus advisory recommendations (unreachable[]). Pure function — no I/O. Use after audit_url_speed + detect_template_type + detect_speed_optimizers.",
    input_schema: {
      type: "object",
      properties: {
        audit:       { type: "object", description: "PsiAudit returned by audit_url_speed" },
        template:    { type: "object", description: "TemplateInfo returned by detect_template_type" },
        optimizers:  { type: "object", description: "OptimizerDetection returned by detect_speed_optimizers" },
      },
      required: ["audit", "template", "optimizers"],
      additionalProperties: false,
    },
  },
  {
    name: "detect_template_type",
    description: "Detect the WordPress template hierarchy type for a URL (front_page, single, page, category, tag, product, shop, ...). Returns count_of_same_type so the agent can prompt 'fix this one or all of this type'.",
    concurrent: true,
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "URL belonging to this WP site" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "detect_speed_optimizers",
    description: "Detect installed WordPress speed/optimization plugins (cache, image, css/js). Returns slug, name, version, active. For image plugins, also returns has_webp_files (sampled from media library).",
    concurrent: true,
    input_schema: {
      type: "object",
      properties: {},
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
  tier: Tier = "enterprise",
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  const gate = tierAllows(name, tier, input);
  if (!gate.ok) {
    return { error: gate.error.message, upgrade_url: gate.error.upgrade_url };
  }
  switch (name) {
    case "list_posts":        return wp.listPosts(args, signal);
    case "get_post_summary":  return wp.getPostSummary(Number(args.id), signal);
    case "get_categories":    return wp.getCategories(signal);
    case "get_tags":          return wp.getTags(signal);
    case "detect_seo_plugin": return wp.detectSeoPlugin(signal);
    case "update_seo_fields": return wp.updateSeoFields(Number(args.post_id), (args.fields ?? {}) as any, args.job_id as string | undefined, signal);
    case "get_history":       return wp.getHistory(args as any, signal);
    case "rollback": {
      const params = (input ?? {}) as { history_ids?: unknown; job_id?: unknown };
      const hasIds = Array.isArray(params.history_ids) && params.history_ids.length > 0;
      const hasJobId = typeof params.job_id === "string" && params.job_id.length > 0;
      if (!hasIds && !hasJobId) {
        return { error: "rollback requires history_ids or job_id" };
      }
      if (hasIds && hasJobId) {
        return { error: "rollback accepts only one of history_ids or job_id, not both" };
      }
      const rollbackArgs = hasJobId
        ? { job_id: params.job_id as string }
        : { history_ids: (params.history_ids as unknown[]).map(v => Number(v)) };
      return wp.rollback(rollbackArgs as any, signal);
    }
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
      // TODO Plan 4: replace with JWT-derived user_id once authentication lands.
      const PLACEHOLDER_USER_ID = 0;

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

      // Concurrent-job guard. Race window between findRunning + createJob is intentional
      // for v1: single-user deployment, no DB-side unique-running constraint. Plan 4 may add SELECT...FOR UPDATE.
      const existing = await wp.findRunningJobForUser(PLACEHOLDER_USER_ID, signal);
      if (existing) {
        return { error: `another bulk job is already running (job_id: ${existing.id})` };
      }

      // Create job in DB
      if (typeof globalThis.crypto?.randomUUID !== "function") {
        throw new Error("apply_style_to_batch: globalThis.crypto.randomUUID unavailable; require Bun ≥1.0 or Node ≥19");
      }
      const jobId = globalThis.crypto.randomUUID();
      await wp.createJob({
        id: jobId,
        user_id: PLACEHOLDER_USER_ID,
        tool_name: "apply_style_to_batch",
        total: ids.length,
        style_hints: trimmedHints,
        // style_hints is stored in its own column (queryable); params_json holds replay-only data.
        params_json: JSON.stringify({ post_ids: ids }),
      }, signal);

      // No emit? Use a no-op fallback (shouldn't happen in production)
      const safeEmit = emit ?? (() => {});

      // Detached lifecycle (Plan 4-B): runBulkJob owns its own AbortController so
      // it survives the chat request's signal aborting (CF 100s, tab close).
      // Cancellation flows ONLY through wp.getJob().cancel_requested_at polling
      // inside runBulkJob (set via cancel_job tool / POST /jobs/{id}/cancel).
      const jobAc = new AbortController();
      const startedAt = new Date().toISOString();

      // Fire-and-forget. .catch persists job=failed so the UI doesn't perpetually
      // see "running"; the startup sweep (Task 6) catches the case where even the
      // markJobDone fails by transitioning stale running rows to interrupted.
      void runBulkJob({
        jobId, postIds: ids, styleHints: trimmedHints,
        wp, craft,
        signal: jobAc.signal,
        emit: safeEmit,
      }).catch(async err => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[runBulkJob ${jobId}] unhandled:`, msg);
        try {
          await wp.markJobDone(jobId, "failed");
        } catch { /* sweep on next backend startup */ }
      });

      return {
        job_id: jobId,
        status: "running" as const,
        total: ids.length,
        style_hints: trimmedHints,
        started_at: startedAt,
      };
    }
    case "cancel_job": {
      const { job_id } = (input ?? {}) as { job_id?: string };
      if (typeof job_id !== "string" || !job_id) {
        return { error: "job_id required" };
      }
      await wp.cancelJob(job_id, signal);
      return { status: "cancel_requested" };
    }
    case "get_job_status": {
      const { job_id } = (input ?? {}) as { job_id?: string };
      if (typeof job_id !== "string" || !job_id) {
        return { error: "job_id required" };
      }
      const job = await wp.getJob(job_id, signal);
      if (!job) {
        return { error: "job not found" };
      }
      return {
        job_id: job.id,
        status: job.status,
        total: job.total,
        done: job.done,
        failed: job.failed_count,
        started_at: job.started_at,
        finished_at: job.finished_at,
        cancel_requested_at: job.cancel_requested_at,
      };
    }

    case "audit_url_speed": {
      // Inputs that the chat-route layer injects, NOT exposed in input_schema:
      //   _psi_api_key  — user's BYO key, decrypted by the chat route from the encrypted WP option
      //   _license_key  — for per-license rate limit
      //   _fetch_impl   — test-only override (typed but stripped at the API boundary; see anthropic-client.ts pattern)
      const a = args as Record<string, unknown>;
      const url = String(a.url ?? "");
      const strategy = (a.strategy === "desktop" ? "desktop" : "mobile") as "mobile" | "desktop";
      const nocache = a.nocache === true;
      const apiKey = typeof a._psi_api_key === "string" ? a._psi_api_key : "";
      const licenseKey = typeof a._license_key === "string" ? a._license_key : undefined;
      const fetchImpl = typeof a._fetch_impl === "function" ? (a._fetch_impl as typeof fetch) : undefined;

      if (!apiKey) return { error: "PSI key not configured. Set it under SEO Agent → Settings → PageSpeed key." };
      if (!url) return { error: "url is required" };

      const { checkPsiRateLimit } = await import("./speed/rate-limit");
      const rl = checkPsiRateLimit(licenseKey, tier);
      if (!rl.ok) return { error: rl.reason, upgrade_url: "https://www.seo-friendly.org/pricing" };

      const { fetchPsi, PsiError } = await import("./speed/psi-client");
      try {
        const audit = await fetchPsi(url, strategy, apiKey, signal, { nocache, fetchImpl });
        return audit;
      } catch (e) {
        if (e instanceof PsiError) return { error: e.message, kind: e.kind };
        throw e;
      }
    }

    case "propose_speed_fixes": {
      const a = args as Record<string, unknown>;
      const audit = a.audit;
      const template = a.template;
      const optimizers = a.optimizers;
      if (!audit || !template || !optimizers) {
        return { error: "audit, template, and optimizers are required" };
      }
      const { proposeSpeedFixes } = await import("./speed/propose");
      return proposeSpeedFixes(audit as any, template as any, optimizers as any);
    }

    default: throw new Error(`unknown tool: ${name}`);
  }
}
