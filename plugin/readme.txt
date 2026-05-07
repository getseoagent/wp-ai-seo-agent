=== GetSEOAgent — AI Bulk SEO Chat ===
Contributors: kirilludrugov
Tags: seo, bulk, ai, chat, content
Requires at least: 6.4
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.2.1
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
* Free tier (chat + read-only tools) and Pro / Agency tiers (write tools, bulk).

= Bring your own Anthropic API key =

You provide your own Anthropic API key in plugin settings. It is stored encrypted in `wp_options` using your site's `AUTH_KEY`. Each chat request sends the key once to our backend over HTTPS; we forward the key to Anthropic's API for that request and do not persist it.

== Compatibility ==

GetSEOAgent works with all four major WordPress SEO plugins. It reads and writes to whichever one is active, without replacing or duplicating their behavior:

* **Rank Math** — full read+write parity (titles, descriptions, focus keywords, OG titles).
* **Yoast SEO** — full read+write parity.
* **All in One SEO (AIOSEO 4.x+)** — full read+write parity. Requires AIOSEO's data table (`{prefix}aioseo_posts`) to be present.
* **SEOPress** — full read+write parity for titles, descriptions, focus keywords. OG title editing requires SEOPress's Social Networks module to be active.

If two or more SEO plugins are simultaneously active, GetSEOAgent writes through the first detected (priority order: Rank Math > Yoast > AIOSEO > SEOPress) and shows an admin notice naming the secondaries. To avoid metadata drift, disable the unused plugin.

If no SEO plugin is detected, GetSEOAgent falls back to read-only mode (post titles only).

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/seo-agent/`, or install through the WordPress plugin directory.
2. Activate the plugin through the **Plugins** screen.
3. Go to **SEO Agent → Settings**, paste your Anthropic API key.
4. Go to **SEO Agent** to start a chat. Free-tier features work immediately.
5. (Optional) Go to **SEO Agent → Subscription** to add a Pro or Agency license key.

== Frequently Asked Questions ==

= Do I need an Anthropic account? =

Yes. The plugin is bring-your-own-key — you create an Anthropic account, generate an API key, and paste it into plugin settings. The plugin never persists the key beyond the in-memory forwarding for each chat request.

= Does it replace my existing SEO plugin (Yoast, RankMath, etc.)? =

No. It writes through your existing plugin's storage, so all your analysis, sitemaps, and schema markup keep working unchanged.

= Can I undo a bulk run? =

Yes. Every change is recorded in an audit log keyed by job ID. Click **Rollback all** on any completed bulk job and the original values are restored.

= What happens on the free tier? =

Free tier allows chat + read-only tools (list posts, read SEO fields, audit history). Write tools and bulk operations require a Pro or Agency license.

= Does the plugin work on shared hosting? =

Yes for chat and read-only operations. Write tools and bulk operations call out to a Node backend over HTTPS — we run a managed instance, or you can self-host it (the backend is open source and ships separately).

= Is my post content sent to a third party? =

Yes. To rewrite your SEO fields, the relevant post title, content, and existing SEO fields are sent to Anthropic's API via our backend, using your API key. See the **Third Party Services** section below.

== Screenshots ==

1. Chat panel with a bulk-rewrite proposal — five sample diffs the user can approve before running on the rest.
2. Bulk progress bar showing live per-post status; cancel button stays available throughout.
3. Bulk summary card with rollback affordance — every job is reversible.
4. Subscription tab — license status, next renewal, masked card, cancel button.

== Changelog ==

= 1.2.1 =
* Internal: moved subscription cancel and diagnose inline scripts to enqueued JS files (wp_enqueue_script + wp_localize_script).
* Internal: factored the SSE chat-stream chunk write into a documented helper to make the "no HTML escaping on event-stream bytes" intent explicit.

= 1.2.0 =
* New: Yoast, AIOSEO, and SEOPress adapters with full read+write parity.
* New: Multi-active SEO plugin detection — admin notice and chat banner when two or more SEO plugins are simultaneously active.
* Internal: `Adapter_Factory::detect()` now returns a list of all detected plugins in priority order.

= 1.1.0 — 2026-04-30 =
* New: speed audit (Pro+) — agent runs Google PageSpeed Insights for any URL on mobile/desktop, diagnoses Core Web Vitals issues, and proposes fixes. Read-only in this release; the apply path lands in 1.2.0.
* New: detect_template_type and detect_speed_optimizers tools for grounding the audit in your site's structure.
* New: PageSpeed Insights API key field under Settings (BYO; Google Cloud free tier sufficient).

= 1.0.0 =
* Initial wp.org release.
* Bulk title / description / focus keyword / OG title rewrites via chat.
* Sample-and-extrapolate UX with 5 sample diffs and one-click apply-to-remaining.
* Audit log + per-job rollback.
* Adapter layer for RankMath, Yoast SEO, AIOSEO, SEOPress (read + write).
* Subscription admin tab with cancel-anytime.
* Free / Pro / Agency tiers gated by license key.

== Upgrade Notice ==

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
