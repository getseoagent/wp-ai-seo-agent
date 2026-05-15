# AI SEO Agent for WordPress

> **Approve 5 samples. Apply to 500.**

Bulk SEO rewrites for WordPress, through chat. AI SEO Agent sits on top of
RankMath, Yoast SEO, AIOSEO, or SEOPress — it augments your existing setup,
it doesn't replace it.

---

## Why

Most AI SEO plugins give you a "rewrite" button on a single post — one button,
one page. That doesn't scale when you have 500 product descriptions written in
the wrong tone.

AI SEO Agent does **sample-and-extrapolate**:

1. You tell it what you want — *"rewrite the meta descriptions on my last 50
   product pages to feel more conversational"*.
2. The agent fetches a sample, proposes 5 diffs, you approve.
3. It applies the same style to the remaining N posts in one bulk operation,
   with full audit history and one-click rollback per job.

You spend a minute approving 5 examples. The agent handles the other 495.

## Features

- **Chat-driven bulk operations** — describe what you want in natural
  language; the agent finds the posts and rewrites them in one go.
- **Sample-and-extrapolate UX** — review 5 sample diffs, approve once,
  apply to hundreds.
- **Reversible by design** — every change is recorded with before/after
  values; rollback an entire job with one click.
- **Works with your existing SEO plugin** — auto-detects RankMath, Yoast SEO,
  All in One SEO, or SEOPress and writes through their storage. Sitemaps,
  schema markup, and on-page analysis keep working unchanged.
- **Cancel mid-flight** — partial work is preserved and individually
  rollback-able.
- **Free tier** — chat + read-only tools (list posts, read SEO fields, audit
  history) work without a paid license.

## Quick start

1. Install AI SEO Agent from the WordPress plugin directory (or upload the
   ZIP from [Releases](https://github.com/getseoagent/wp-ai-seo-agent/releases)).
2. Activate the plugin, go to **SEO Agent → Settings**, paste your Anthropic
   API key.
3. Open the **SEO Agent** menu and start chatting.

   > "Rewrite the SEO titles on my last 50 product pages to be under 60 chars
   > and front-load the brand."

4. Review the 5 sample diffs the agent proposes. Approve.
5. Click **Apply to remaining**. Watch the progress bar; cancel any time;
   rollback any time.

## Pricing

| Tier        | Price        | What                                                              |
|-------------|--------------|-------------------------------------------------------------------|
| Free        | $0           | Chat + read-only tools                                            |
| Pro         | $19 / month  | Write tools + bulk operations + audit + rollback                  |
| Agency      | $79 / month  | Pro + multi-site + priority support                               |
| Enterprise  | $299 / month | Agency + SSO + on-premise option                                  |

Cancel any time from the **Subscription** tab in the plugin. Recurring billing
is handled by WayForPay; your card details are never seen by us.

Sign up at **[getseoagent.app](https://getseoagent.app)**.

## How it works

The plugin is a thin WordPress wrapper around a Node backend. The backend
runs the agent loop, calls Anthropic with the API key you provided, and
orchestrates bulk operations. The plugin reads and writes SEO fields through
whichever SEO plugin you already have installed.

You can either use the managed backend (default — easiest), or self-host the
backend on your own infrastructure. Both modes use the same plugin from
WordPress.org. See **[docs/self-hosting.md](docs/self-hosting.md)** for the
self-host setup.

## Bring your own Anthropic API key

AI SEO Agent is bring-your-own-key. You create an Anthropic account, generate
an API key, and paste it into plugin settings. The key is encrypted at rest in
`wp_options` using your site's `AUTH_KEY`, and forwarded once per chat request
to our backend, which forwards it to Anthropic for that single request and
does not persist it.

## License

This is an open-core project:

- The **WordPress plugin** in `plugin/` is licensed under
  **[GPL-2.0-or-later](plugin/LICENSE.txt)** (required for WordPress.org
  distribution).
- The **backend service** in `backend/` is licensed under the
  **[Business Source License 1.1](backend/LICENSE)** with an Apache 2.0
  transition on April 28, 2030. You may self-host for your own WordPress
  sites or sites under your direct operational control. Offering the
  backend as a managed service to third parties requires a commercial
  license — contact `licensing@getseoagent.app`.

## Links

- **Plugin on WordPress.org** — [wordpress.org/plugins/getseoagent](https://wordpress.org/plugins/getseoagent/) *(v1.1.0 — Speed Audit + Yoast/AIOSEO/SEOPress adapters)*
- **Product website** — [getseoagent.app](https://getseoagent.app)
- **Self-hosting guide** — [docs/self-hosting.md](docs/self-hosting.md)
- **Contributing** — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security policy** — [SECURITY.md](SECURITY.md)
- **Changelog** — [CHANGELOG.md](CHANGELOG.md)

## About

Built by **Kyrylo Udruhov** (d/b/a SEO-FRIENDLY). If you have ideas, find
bugs, or want to talk about how AI SEO Agent could fit your workflow, open an
issue or reach out through the contact channels above.
