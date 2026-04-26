import type { WpClient } from "./wp-client";

export type Tool = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
};

export const tools: Tool[] = [
  {
    name: "list_posts",
    description: "List published posts with optional category/tag/date filters. Returns id, post_title, slug, status, modified.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category slug" },
        tag:      { type: "string", description: "Tag slug" },
        status:   { type: "string", description: "Post status, default 'publish'" },
        limit:    { type: "integer", description: "Max items, default 20, max 50" },
        cursor:   { type: "integer", description: "Offset for pagination" },
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
];

export async function dispatchTool(name: string, input: unknown, wp: WpClient, signal?: AbortSignal): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "list_posts":        return wp.listPosts(args, signal);
    case "get_post_summary":  return wp.getPostSummary(Number(args.id), signal);
    case "get_categories":    return wp.getCategories(signal);
    case "get_tags":          return wp.getTags(signal);
    case "detect_seo_plugin": return wp.detectSeoPlugin(signal);
    default: throw new Error(`unknown tool: ${name}`);
  }
}
