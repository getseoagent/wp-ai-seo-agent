type Cfg = { baseUrl: string; sharedSecret: string };

export type ListPostsArgs = {
  category?: string;
  tag?: string;
  status?: string;
  after?: string;
  before?: string;
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
  async function call<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const url = new URL(`${cfg.baseUrl}/wp-json/seoagent/v1${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-shared-secret": cfg.sharedSecret },
    });
    if (!res.ok) throw new Error(`WP REST ${res.status} on ${path}`);
    return await res.json() as T;
  }

  return {
    listPosts: (args: ListPostsArgs) =>
      call<{ posts: PostListItem[]; next_cursor: number|null; total: number }>("/posts", args as Record<string, unknown>),
    getPostSummary: (id: number) =>
      call<PostSummary | null>(`/post/${id}/summary`),
    getCategories: () => call<Term[]>("/categories"),
    getTags:       () => call<Term[]>("/tags"),
    detectSeoPlugin: () => call<{ name: string }>("/detect-seo-plugin"),
  };
}

export type WpClient = ReturnType<typeof createWpClient>;
