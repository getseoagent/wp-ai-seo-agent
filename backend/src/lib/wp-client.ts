type Cfg = { baseUrl: string; sharedSecret: string; writeSecret?: string };

export type ListPostsArgs = {
  category?: string;
  tag?: string;
  status?: string;
  after?: string;
  before?: string;
  slugs?: string[];
  limit?: number;
  cursor?: number;
};

export type PostListItem = {
  id: number; post_title: string; slug: string; status: string; modified: string;
  word_count: number;   // new in 3c
};

export type PostSummary = {
  id: number; post_title: string; slug: string; status: string; modified: string;
  word_count: number;
  content_preview: string;
  current_seo: { title: string|null; description: string|null; focus_keyword: string|null; og_title: string|null };
};

export type Term = { id: number; name: string; slug: string; count: number };

export type SeoFields = Partial<{
  title: string;
  description: string;
  focus_keyword: string;
  og_title: string;
}>;

export type HistoryRow = {
  id: number; post_id: number; job_id: string; field: string;
  before_value: string|null; after_value: string|null;
  status: string; reason: string|null;
  user_id: number|null; created_at: string; rolled_back_at: string|null;
};

export type GetHistoryArgs = { post_id?: number; job_id?: string; limit?: number; cursor?: number };

export type Job = {
  id: string;
  user_id: number;
  tool_name: string;
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted";
  total: number;
  done: number;
  failed_count: number;
  style_hints: string | null;
  params_json: string | null;
  started_at: string;
  finished_at: string | null;
  cancel_requested_at: string | null;
  last_progress_at: string | null;
};

export type CreateJobArgs = {
  id: string;
  user_id?: number;
  tool_name: string;
  total: number;
  style_hints?: string | null;
  params_json?: string | null;
};

export function createWpClient(cfg: Cfg) {
  type SecretKind = "read" | "write";
  async function call<T>(
    path: string,
    opts: { query?: Record<string, unknown>; body?: unknown; method?: "GET"|"POST"; secretKind?: SecretKind; signal?: AbortSignal; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const url = new URL(`${cfg.baseUrl}/wp-json/seoagent/v1${path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null || v === "") continue;
        if (Array.isArray(v)) { if (v.length > 0) url.searchParams.set(k, v.join(",")); }
        else url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {};
    if ((opts.secretKind ?? "read") === "write") {
      headers["X-Write-Secret"] = cfg.writeSecret ?? "";
    } else {
      headers["x-shared-secret"] = cfg.sharedSecret;
    }
    if (opts.headers) Object.assign(headers, opts.headers);
    const init: RequestInit = {
      method: opts.method ?? "GET",
      headers,
      signal: opts.signal,
    };
    if (opts.body !== undefined) {
      if (!headers["content-type"] && !headers["Content-Type"]) headers["content-type"] = "application/json";
      init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }
    const res = await fetch(url.toString(), init);
    if (!res.ok) throw new Error(`WP REST ${res.status} on ${path}`);
    return await res.json() as T;
  }

  return {
    listPosts: (args: ListPostsArgs, signal?: AbortSignal) =>
      call<{ posts: PostListItem[]; next_cursor: number|null; total: number }>("/posts", { query: args as Record<string, unknown>, signal }),
    getPostSummary: (id: number, signal?: AbortSignal) =>
      call<PostSummary | null>(`/post/${id}/summary`, { signal }),
    getCategories: (signal?: AbortSignal) => call<Term[]>("/categories", { signal }),
    getTags:       (signal?: AbortSignal) => call<Term[]>("/tags", { signal }),
    detectSeoPlugin: (signal?: AbortSignal) => call<{ name: string }>("/detect-seo-plugin", { signal }),

    updateSeoFields: (post_id: number, fields: SeoFields, job_id?: string, signal?: AbortSignal) =>
      call<{ job_id: string; results: Array<Record<string, unknown>> }>(`/post/${post_id}/seo-fields`, {
        method: "POST",
        secretKind: "write",
        body: { ...(job_id ? { job_id } : {}), fields },
        signal,
      }),

    getHistory: (args: GetHistoryArgs, signal?: AbortSignal) =>
      call<{ rows: HistoryRow[]; next_cursor: number|null; total: number }>("/history", {
        query: args as Record<string, unknown>,
        signal,
      }),

    rollback: (
      params: { history_ids: number[]; job_id?: never } | { history_ids?: never; job_id: string },
      signal?: AbortSignal
    ) =>
      call<{ job_id: string; results: Array<Record<string, unknown>> }>("/rollback", {
        method: "POST",
        secretKind: "write",
        body: params,
        signal,
      }),

    createJob: (args: CreateJobArgs, signal?: AbortSignal) =>
      call<Job>(`/jobs`, {
        method: "POST",
        body: JSON.stringify(args),
        signal,
        secretKind: "write",
        headers: { "Content-Type": "application/json" },
      }),

    getJob: async (id: string, signal?: AbortSignal): Promise<Job | null> => {
      try {
        return await call<Job>(`/jobs/${encodeURIComponent(id)}`, { signal });
      } catch (err) {
        if (err instanceof Error && /404/.test(err.message)) return null;
        throw err;
      }
    },

    updateJobProgress: (id: string, done: number, failed_count: number, signal?: AbortSignal) =>
      call<{ ok: boolean }>(`/jobs/${encodeURIComponent(id)}/progress`, {
        method: "POST",
        body: JSON.stringify({ done, failed_count }),
        signal,
        secretKind: "write",
        headers: { "Content-Type": "application/json" },
      }),

    markJobDone: (id: string, status: Job["status"], signal?: AbortSignal) =>
      call<{ ok: boolean }>(`/jobs/${encodeURIComponent(id)}/done`, {
        method: "POST",
        body: JSON.stringify({ status }),
        signal,
        secretKind: "write",
        headers: { "Content-Type": "application/json" },
      }),

    cancelJob: (id: string, signal?: AbortSignal) =>
      call<{ status: string }>(`/jobs/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        signal,
        secretKind: "write",
      }),

    sweepInterruptedJobs: (thresholdMinutes: number, signal?: AbortSignal): Promise<{ interrupted: number }> =>
      call<{ interrupted: number }>("/jobs/sweep-interrupted", {
        method: "POST",
        body: JSON.stringify({ minutes: thresholdMinutes }),
        signal,
        secretKind: "write",
        headers: { "Content-Type": "application/json" },
      }),

    findRunningJobForUser: async (user_id: number, signal?: AbortSignal): Promise<Job | null> => {
      // Plan 4-B: GET /jobs returns { jobs: Job[] } (wrapped) so the same
      // endpoint can carry filtered lists for the frontend banner. Older
      // installs returning a bare array are unreachable now (plugin migrated
      // to the wrapped shape in lockstep with this client change).
      const body = await call<{ jobs: Job[] }>(`/jobs?user_id=${encodeURIComponent(user_id)}&status=running`, { signal });
      return body.jobs[0] ?? null;
    },
  };
}

export type WpClient = ReturnType<typeof createWpClient>;
