type Cfg = { baseUrl: string; sharedSecret: string };

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
};

export type PostSummary = {
  id: number; post_title: string; slug: string; status: string; modified: string;
  word_count: number;
  current_seo: { title: string|null; description: string|null; focus_keyword: string|null; og_title: string|null };
};

export type Term = { id: number; name: string; slug: string; count: number };

export function createWpClient(cfg: Cfg) {
  async function call<T>(path: string, query?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const url = new URL(`${cfg.baseUrl}/wp-json/seoagent/v1${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === "") continue;
        if (Array.isArray(v)) {
          if (v.length > 0) url.searchParams.set(k, v.join(","));
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-shared-secret": cfg.sharedSecret },
      signal,
    });
    if (!res.ok) throw new Error(`WP REST ${res.status} on ${path}`);
    return await res.json() as T;
  }

  return {
    listPosts: (args: ListPostsArgs, signal?: AbortSignal) =>
      call<{ posts: PostListItem[]; next_cursor: number|null; total: number }>("/posts", args as Record<string, unknown>, signal),
    getPostSummary: (id: number, signal?: AbortSignal) =>
      call<PostSummary | null>(`/post/${id}/summary`, undefined, signal),
    getCategories: (signal?: AbortSignal) => call<Term[]>("/categories", undefined, signal),
    getTags:       (signal?: AbortSignal) => call<Term[]>("/tags", undefined, signal),
    detectSeoPlugin: (signal?: AbortSignal) => call<{ name: string }>("/detect-seo-plugin", undefined, signal),
  };
}

export type WpClient = ReturnType<typeof createWpClient>;
