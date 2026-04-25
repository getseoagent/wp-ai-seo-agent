# AI SEO Agent for WordPress

Bulk SEO operations through dialog, on top of RankMath/Yoast/AIOSEO/SEOPress.

See: `docs/superpowers/specs/2026-04-25-wp-ai-seo-agent-design.md`

## Layout

- `plugin/` — WordPress plugin (PHP), distributable
- `plugin-app/` — React source for the admin chat UI
- `backend/` — Node (Bun) service that orchestrates the agent

## Plan 1: Walking skeleton

End-to-end chat works. No tools yet.
