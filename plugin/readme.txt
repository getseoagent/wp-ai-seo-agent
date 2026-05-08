=== GetSEOAgent — AI Bulk SEO Chat ===
Contributors: kirilludrugov
Tags: seo, bulk, ai, chat, content
Requires at least: 6.4
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.0.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Bulk SEO rewrites through chat. Sample-and-extrapolate UX, sits on top of RankMath, Yoast, AIOSEO, or SEOPress.

== Description ==

GetSEOAgent rewrites SEO titles, meta descriptions, focus keywords, and OG titles for many posts at once, through a chat dialog inside your WordPress admin. The wedge: instead of a per-post AI button, you describe the style on a sample of 5 posts, approve the diff, and the agent applies the same pattern to the remaining N posts in a single bulk operation.

The plugin does not replace your existing SEO plugin — it augments whichever one you have installed. SEO fields are written through that plugin's storage (RankMath, Yoast SEO, All in One SEO, SEOPress), so your existing analysis, sitemaps, and rich snippets keep working.

= How it works =

1. Open the SEO Agent panel in your WordPress admin.
2. Type what you want — for example: "rewrite the meta descriptions on my last 50 product pages to feel more conversational".
3. The agent fetches a sample, proposes diffs, you approve.
4. Approve the bulk run; the agent applies the same style to all matched posts, with full audit history and one-click rollback.

= Key features =

* Bulk title / description / focus keyword / OG title rewrites — chat-driven.
* Sample-and-extrapolate workflow: review 5 diffs, then apply to N.
* Audit log for every change with before/after values and per-job rollback.
* Adapter layer auto-detects RankMath, Yoast SEO, AIOSEO, or SEOPress.
* Cancel a bulk job mid-flight — partial work is preserved and rollback-able.
* Connects to the GetSEOAgent service for AI processing — free tier available, Pro / Agency plans offer higher monthly quotas. See https://getseoagent.app/pricing.

= Bring your own Anthropic API key =

You provide your own Anthropic API key in plugin settings. It is stored encrypted in `wp_options` using your site's `AUTH_KEY`. Each chat request sends the key once to our backend over HTTPS; we forward the key to Anthropic's API for that request and do not persist it.

= Source code =

Built from public sources at https://github.com/getseoagent/wp-ai-seo-agent — the bundled JavaScript in `assets/dist/` is generated from React/TypeScript in `plugin-app/src/` using Vite + Bun (or npm). Full build instructions are in the "Source Code & Build Instructions" section below.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/getseoagent/`, or install through the WordPress plugin directory.
2. Activate the plugin through the **Plugins** screen.
3. Go to **SEO Agent → Settings**, paste your Anthropic API key.
4. Go to **SEO Agent → Subscription**, paste a GetSEOAgent license key (the free tier at https://getseoagent.app/pricing requires no card).
5. Go to **SEO Agent** to start a chat.

== Source Code & Build Instructions ==

The minified JavaScript and CSS bundled in `assets/dist/` are built from React/TypeScript sources hosted publicly at:

https://github.com/getseoagent/wp-ai-seo-agent

* Source location in the repo: `plugin-app/src/`
* Build tool: Vite + Bun (or npm)
* Build command: `cd plugin-app && bun install && bun run build` (or `npm install && npm run build`)
* Output: Vite writes the bundle directly into `plugin/assets/dist/` (configured output directory in `plugin-app/vite.config.ts`)

A standalone build of the production bundle reproduces the exact files shipped in `assets/dist/`. Each emitted JavaScript chunk also begins with a `/*! Source: https://github.com/getseoagent/wp-ai-seo-agent — see plugin-app/src/ */` banner, so the minified bundle is never opaque.

== Frequently Asked Questions ==

= Do I need an Anthropic account? =

Yes. The plugin is bring-your-own-key — you create an Anthropic account, generate an API key, and paste it into plugin settings. The plugin never persists the key beyond the in-memory forwarding for each chat request.

= Does it replace my existing SEO plugin (Yoast, RankMath, etc.)? =

No. It writes through your existing plugin's storage, so all your analysis, sitemaps, and schema markup keep working unchanged.

= Can I undo a bulk run? =

Yes. Every change is recorded in an audit log keyed by job ID. Click **Rollback all** on any completed bulk job and the original values are restored.

= Does the plugin work without a paid plan? =

The plugin code is fully functional GPL — nothing inside it is locked. AI processing runs on the GetSEOAgent service, which has a free tier (limited monthly quota) and Pro / Agency plans with larger quotas. See https://getseoagent.app/pricing for the current limits.

= Does the plugin work on shared hosting? =

Yes. AI processing and bulk job orchestration run on the GetSEOAgent backend (Node.js service hosted on Hetzner Cloud); your WordPress server only makes HTTPS requests to that backend. The backend is also open-source and self-hostable if you'd rather keep all traffic on your own infrastructure — see https://github.com/getseoagent/wp-ai-seo-agent/blob/main/docs/self-hosting.md.

= Is my post content sent to a third party? =

Yes. To rewrite your SEO fields, the relevant post title, content, and existing SEO fields are sent to Anthropic's API via our backend, using your API key. See the **Third Party Services** section below.

== Screenshots ==

1. Chat panel with a bulk-rewrite proposal — five sample diffs the user can approve before running on the rest.
2. Bulk progress bar showing live per-post status; cancel button stays available throughout.
3. Bulk summary card with rollback affordance — every job is reversible.
4. Subscription tab — license status, next renewal, masked card, cancel button.

== Changelog ==

= 1.0.2 =
* Compliance (wp.org review): source-code visibility — added a "Source code" subsection to the Description and moved the full "Source Code & Build Instructions" section to immediately after Installation (was previously between Screenshots and Changelog) so the public GitHub link and Vite/Bun build steps appear higher on the rendered plugin page.
* Compliance (wp.org review): added a `/*! Source: https://github.com/getseoagent/wp-ai-seo-agent — see plugin-app/src/ */` banner to every JavaScript chunk emitted by Vite via `rollupOptions.output.banner`, so even the raw minified bundle points reviewers and developers to the public source.

= 1.0.1 =
* Compliance: rewrote the SSE chat-stream proxy to use `wp_remote_post()` together with the `http_api_curl` filter (per the WordPress HTTP API guideline). All `curl_*` calls have been removed from the plugin's own code; chunk-by-chunk SSE streaming is preserved by attaching `CURLOPT_WRITEFUNCTION` to the WP-managed cURL handle inside the filter.
* Compliance: rewrote tier-related copy in `readme.txt` and the Subscription page so that Pro / Agency are described as **service tiers** of the external GetSEOAgent API (Akismet / Jetpack model), not as plugin-locked features. No PHP feature gates exist or are introduced; the plugin code is fully functional GPL.
* Compliance: extracted the diagnose-button and subscription-cancel inline `<script>` blocks into enqueued JS files (`assets/admin/diagnose.js`, `assets/admin/subscription.js`), wired via `wp_enqueue_script` + `wp_localize_script`.
* Docs: added a "Source Code" section in `readme.txt` pointing to the public GitHub repository and the Vite/Bun build steps that reproduce the shipped bundle.

= 1.0.0 =
* Initial wp.org release.
* Bulk title / description / focus keyword / OG title rewrites via chat.
* Sample-and-extrapolate UX with 5 sample diffs and one-click apply-to-remaining.
* Audit log + per-job rollback.
* Adapter layer for RankMath, Yoast SEO, AIOSEO, SEOPress (read + write).
* Subscription admin tab with cancel-anytime.
* Subscription support for the GetSEOAgent service plans (free / Pro / Agency).

== Upgrade Notice ==

= 1.0.2 =
Documentation-only — re-locates the source-code link and Vite/Bun build instructions to a more prominent position in `readme.txt` and adds a source-link banner to bundled JS. No functional changes.

= 1.0.1 =
Compliance fixes for the wp.org Plugin Directory review (HTTP API, source-code link, service-tier copy, enqueued admin scripts). No functional changes.

= 1.0.0 =
First public release.

== Third Party Services ==

This plugin connects to two third-party services to function. By using GetSEOAgent you agree to the terms and privacy policies of each.

**1. Anthropic API (anthropic.com)**

What is sent: post title, post content excerpts, existing SEO field values for the posts you ask the agent to operate on, plus your Anthropic API key.
When: each chat turn that proposes or applies a rewrite.
Why: to generate the SEO rewrite text.
Terms: https://www.anthropic.com/legal/commercial-terms
Privacy: https://www.anthropic.com/legal/privacy

**2. GetSEOAgent backend (managed by SEO-FRIENDLY, hosted on Hetzner Cloud)**

What is sent: chat session messages, post IDs, the SEO operations you ask for, your license key (if set), and the site URL of your WordPress install. Your Anthropic API key is forwarded once per request and not persisted on the backend.
When: each chat turn.
Why: the agent loop, bulk job orchestration, and license verification run server-side; the WordPress plugin is a thin client.
Privacy: https://www.seo-friendly.org/privacy
Terms: https://www.seo-friendly.org/terms

A self-hosted backend is available if you prefer to keep all traffic on your own infrastructure — see https://github.com/getseoagent/wp-ai-seo-agent/blob/main/docs/self-hosting.md for setup notes.
