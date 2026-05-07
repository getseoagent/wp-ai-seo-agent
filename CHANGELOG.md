# Changelog

All notable changes to the AI SEO Agent project (plugin + backend + plugin-app, versioned together).

This is the canonical changelog. `plugin/readme.txt` mirrors the plugin-relevant subset for wp.org.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it ships v1.0.0 publicly.

## [Unreleased]

## [1.2.1] — 2026-05-05

### Changed
- Plugin: `Subscription_Page` cancel-button JS moved to `assets/admin/subscription.js`, enqueued via `wp_enqueue_script` + `wp_localize_script` instead of an interpolated inline `<script>` block.
- Plugin: `Admin_Page` diagnose-button JS moved to `assets/admin/diagnose.js` with the same enqueue pattern.
- Plugin: SSE chunk write in `REST_Controller::proxy_chat` extracted into `emit_sse_chunk()` helper with explicit "raw event-stream, no HTML escaping" docblock; intent is no longer hidden behind a `phpcs:ignore` on a bare `echo`.

### Why
- wp.org plugin review (Apr 2026 round) flagged inline `<script>` tags and the bare `echo $chunk` for output-escaping. None were a security bug — values were already `wp_json_encode`'d and SSE bytes can't be HTML-escaped — but the directory's automated checks key on the patterns themselves.

## [1.1.0] — 2026-04-30

### Added
- Backend: `audit_url_speed` tool wraps Google PageSpeed Insights v5; cached for 60 minutes per (url, strategy).
- Backend: `propose_speed_fixes` pure function maps Lighthouse opportunities → structured `SpeedFix[]` and `SpeedRec[]`.
- Backend: `detect_template_type` and `detect_speed_optimizers` tools, both backed by new WP REST endpoints.
- Backend: per-license daily PSI cap on Pro tier (500/day); Agency unlimited.
- Plugin: `Template_Detector` and `Optimizer_Detector` classes; `/template-info` and `/speed-optimizers` REST routes.
- Plugin: encrypted PSI API key option (`seo_agent_psi_api_key`); admin form alongside the Anthropic key.
- Plugin-app: `SpeedAuditCard` component (CWV badges, reachable/unreachable lists, free-tier upgrade prompt).
- Chat prompt: speed-flow conventions added.

### Tests
- Backend: 244 bun (was 212).
- Plugin: 137 phpunit (was 122).
- Plugin-app: 44 vitest (was 38).

### Polish
- Bootstrap validation: backend refuses to start if `JWT_SECRET`, `LICENSE_HMAC_SECRET`, or `WAYFORPAY_MERCHANT_SECRET_KEY` are shorter than 32 characters.
- `class-options.php` centralises every wp_options key the plugin writes; `Settings` / `License` / `uninstall.php` reference the constants instead of duplicating string literals.
- dbDelta SQL fixed: PRIMARY KEY moved out of column-inline declaration; anonymous `INDEX (...)` clauses replaced with named `KEY idx_*` (resolves "Multiple primary key defined" + "Incorrect index name ''" warnings observed in prod error.log on plugin activation). Tables now declared `ENGINE=InnoDB` so the rollback transaction's `START TRANSACTION / COMMIT / ROLLBACK` semantics actually apply.
- `_helpers/test-jwt.ts` centralises the test JWT secret and `setupTestJwt()`; three test files migrated.
- `.editorconfig` at repo root (tabs for PHP per WPCS, 2-space soft for TS/JS/SQL, LF/UTF-8).

### Security
- `handle_list_posts` whitelists `post_type` against `get_post_types(['public' => true])`. A JWT-bearer caller could previously have requested `post_type=revision` or `post_type=oembed_cache` and exfiltrated non-public bodies through the listing.
- `category_name` and `tag` query-args now flow through `sanitize_title()`.
- `handle_update_seo_fields` swaps `wp_kses_post` → `sanitize_text_field` for SEO field values. Title / description / focus_keyword / og_title are plain text; the previous filter would have let `<a>` / `<img>` through into `<title>`, which is stored-XSS bait if a future Rank Math template ever renders unsanitized.
- `proxy_chat` error responses no longer echo `$e->getMessage()` or `curl_error($ch)` to the SSE client. Both can leak backend hostnames (`Could not resolve host: backend.internal:7117`); full detail goes to `error_log()`, generic message to the browser.
- New per-IP rate limit on the public `/auth/token` endpoint via `lib/rate-limit.ts` (fixed-window token bucket; 10 mints/min default, configurable via `AUTH_TOKEN_RATE_LIMIT_PER_MIN`). Defense-in-depth against credential-fingerprint scans now that the endpoint is unauthenticated.

### Quality
- Backend TypeScript strict-mode is now zero errors (was 34 pre-existing). Mostly tightened test-side mocks (`as unknown as typeof fetch`, narrowed `find()` predicates, discriminated-union narrowing on `TierGateResult`).

## [0.8.0-recurring-billing] — 2026-04-28

Plan 4-A Block 4 — recurring billing. Closes Plan 4-A in full.

### Added
- `003_recurring.sql` migration: `wayforpay_recurring_token`, `wayforpay_card_pan`, `recurring_state`, `next_charge_at`, `last_charge_*`, `retry_count`, `cancelled_at`, `renewal_reminder_sent_for` columns on `licenses`. Partial index on `(next_charge_at) WHERE recurring_state='active'`.
- `lib/billing/retry-state.ts` — pure `[1d, 3d, 7d]` dunning schedule.
- `lib/billing/billing-worker.ts` — `tickOnce` with charge phase + reminder phase. `startBillingWorker` runs first tick 2 min after boot, then every 6h.
- `lib/billing/emails/transport.ts` — Brevo `/v3/smtp/email` wrapper; 1× retry on 5xx; no-op when `BREVO_API_KEY` unset.
- 4 templates: `license-issued`, `upcoming-renewal`, `charge-failed`, `cancelled`. Shared `_helpers.ts` with branded chrome.
- `GET /license/<key>/details` (JWT-gated, license_key match): returns rich payload for the Subscription tab.
- Plugin Subscription admin tab (`class-subscription-page.php`): status table, masked card last-4, AJAX cancel button, no-license CTA + paste-key form.
- WP Plan 4-D wp.org submission prep: full readme.txt (Description / Installation / FAQ / Screenshots / Changelog / Upgrade Notice / **Third Party Services**), `uninstall.php`, `LICENSE.txt`, ABSPATH guards on every PHP file, `phpcs.xml.dist` (WordPress + PHPCompatibility), 0 errors / 0 warnings, i18n hooks (`__()` / `esc_html__()`) on every user-facing string, `seo-agent.pot` template, `scripts/build-wporg-zip.sh` whitelist-copy producing `dist/seo-agent.zip` (~84 KB).
- `TEST_DATABASE_URL` isolation — dedicated `seoagent_test` database; `_helpers/test-db.ts::testDbUrl()` refuses to run if it equals `DATABASE_URL`.
- systemd unit (`scripts/seoagent-backend.service` + `install-systemd.sh`) — `Restart=on-failure`, hardening flags, journald logs.

### Changed
- `POST /license/<key>/cancel` now sets `recurring_state='cancelled'` + `cancelled_at` (was: only `disabled_reason`). `status` stays `'active'` so customer keeps access until `expires_at`.
- WayForPay webhook on `Approved` now captures `recToken` + `cardPan` and stamps `next_charge_at = NOW + 29 days` so the worker can auto-renew.
- WebhookDeps shape: `sendLicenseIssuedEmail(to, key, tier)` → unified `sendEmail(kind, license)`.

### Tests
- backend 207/207 bun, plugin 122/122 phpunit, plugin-app 37/37 vitest.

## [0.7.0-jwt-auth] — 2026-04-28

Plan 4-A Blocks 1-3 — Postgres sessions + license core + JWT cutover.

### Added
- Postgres-backed `sessions` + `session_messages` (`001_sessions.sql`); daily retention sweep with `SESSION_RETENTION_DAYS` (default 90).
- `licenses` table (`002_licenses.sql`) + sessions FK; HMAC-SHA256 + base32 license-key format with embedded expiry; tier × tool gate (`free`, `pro`, `agency`, `enterprise`); 60s license cache with negative-result caching.
- `GET /license/<key>/verify`, `POST /license/<key>/cancel` (JWT-gated).
- WayForPay client (HMAC-MD5 sigs + chargeRecurring); WFP webhook (initial purchase + refund).
- HS256 JWT primitive (`lib/jwt.ts`) with current/previous rotation window; `requireJwt` middleware; `POST /auth/token` mints scoped JWT from license_key.
- `/chat` switched to `requireJwt`; tier flows JWT → `runAgent` → tier-gate.
- Plugin `class-license.php` (AUTH_KEY-encrypted license_key + JWT cache); `class-jwt-verifier.php` (pure HS256); `permit_admin_or_jwt` callback.
- Backend `wp-client.ts` signs 60s service-JWTs (`sub:"service"`, `scope:"read"|"write"`) and sends `Authorization: Bearer` on every plugin call.

### Changed
- Cutover: `SHARED_SECRET` and `WRITE_SECRET` removed from both sides entirely. One trust mechanism end-to-end: HS256 with shared `JWT_SECRET` ↔ `SEO_AGENT_JWT_SECRET`.
- `wp-config.php` runbook: removed `SEO_AGENT_SHARED_SECRET` + `SEO_AGENT_WRITE_SECRET`; added `SEO_AGENT_JWT_SECRET`.

### Tests
- backend 179/179 bun, plugin 114/114 phpunit.

## [0.6.0-bulk-decouple] — 2026-04-27

Plan 4-B — bulk decouple from SSE + concurrent read tools.

### Added
- Job-polling architecture: `useJobPolling` is the source-of-truth for bulk-job state; SSE demoted to opportunistic patches. Bulk runs survive past CF Free's 100s SSE cap.
- `concurrent: boolean` flag on `Tool`; `runAgent` splits read/write fan-out via `Promise.allSettled`.
- `wp_seoagent_jobs.current_post_id` + `current_post_title` columns; `seoagent_db_version` schema-version tracker on `plugins_loaded`.

### Changed
- `GET /wp-json/seoagent/v1/jobs` now returns `{jobs: Job[]}` (was bare `Job[]`).
- `max_tokens` retained at 4096 (set in 0.5.1); `idleTimeout` 255s.

### Fixed
- Hotfix: `concurrent` flag stripped at the Anthropic-API boundary in `anthropic-client.ts` (was leaking into the `tools[]` request body).

### Tests
- backend 112/112 bun, plugin 85/85 phpunit, plugin-app 37/37 vitest (added `@testing-library/react` + jsdom).

## [0.5.1-3c-polish] — 2026-04-27

Plan 3c polish round.

### Fixed
- PHP `set_time_limit(0)` in `proxy_chat` — default 60s `max_execution_time` was killing SSE streams on bulk runs.
- Anthropic `max_tokens` 1024 → 4096 — the old placeholder couldn't fit tool-heavy turns; 47 parallel `tool_use` blocks were truncated → loop ended with 0 tools dispatched.
- Bun `idleTimeout` 10s → 255s — default was killing slow craft calls mid-stream.

### Changed
- Chat prompt clarifications; XOR rollback union; extracted `bulk-styles.ts`.

### Added
- Typing indicator + Stop button while agent is busy.

## [0.5.0-3c-bulk-engine] — 2026-04-27

Plan 3c — bulk engine + UX.

### Added
- `wp_seoagent_jobs` table + `Jobs_Store` + 6 REST endpoints.
- `runBulkJob` with token-bucket pool of 3 + `AbortSignal` fan-out + cancel polling.
- `apply_style_to_batch` tool (200 cap + concurrent-job guard).
- `cancel_job` / `get_job_status` / `rollback{job_id}` tools.
- SSE `bulk_progress` event; `BulkSummaryCard` + `BulkProgressBar` + `useSseChat.progressByJobId`.
- `RewriteCard` action row (`[Apply to remaining]` + `[Refine]` shortcuts).

### Tests
- backend 105/105 bun, plugin 77/77 phpunit, plugin-app 17/17 vitest.

## [0.4.0-3b-craft-pipeline] — 2026-04-26

Plan 3b — craft pipeline + propose_seo_rewrites.

### Added
- `lib/craft.ts` (composeRewrite + CraftError); `lib/craft-prompt.ts` (CRAFT_SYSTEM_PROMPT + buildUserMessage with XML escape).
- `propose_seo_rewrites` tool with `Promise.allSettled` fan-out (cap 20 ids).
- `RewriteCard.tsx` (semantic `<del>`/`<ins>`, intent badges, `<details>` reasoning).
- `bun run eval` script + 3 fixtures (EN / RU / PL).

### Tests
- backend 70/70 bun, plugin 57/57 phpunit, plugin-app 12/12 vitest.

## [0.3.0-3a-writes-audit-rollback] — 2026-04-26

Plan 3a — writes + audit + rollback.

### Added
- `wp_seoagent_history` table + `History_Store`.
- Adapter setters (interface + Fallback no-ops + RankMath with `supports()`).
- `slugs` filter on `list_posts`; `post_type` filter retrofit.
- `permit_admin_or_write_secret` callback (distinct `X-Write-Secret` header) — replaced in 0.7.0 by JWT.
- `POST /post/<id>/seo-fields`, `GET /history`, `POST /rollback`.
- 3 new tools: `update_seo_fields`, `get_history`, `rollback`.

### Tests
- backend 42/42 bun, plugin 54/54 phpunit, plugin-app 6/6 vitest.

## [0.2.0-read-tools] — 2026-04-26

Plan 2 — WP read tools + adapter layer.

### Added
- `Seo_Fields_Adapter` interface (read-only); `Fallback_Adapter`; `Rank_Math_Adapter`.
- WP read tools: `list_posts`, `get_post_summary`, taxonomies.
- `permit_admin_or_secret` callback (replaced in 0.7.0 by JWT).
- In-memory `Map<sessionId, Message[]>` session store with LRU eviction (replaced in 0.7.0 by Postgres).

### Tests
- backend 32/0 bun, plugin 25/49 phpunit, plugin-app 6/6 vitest.

## [0.1.0-walking-skeleton] — 2026-04-26

Plan 1 — walking skeleton.

### Added
- WordPress plugin shell + Bun + Hono backend + React admin app.
- End-to-end SSE chat through full pipe (no tools).
- BYO Anthropic API key (encrypted in `wp_options` via `AUTH_KEY`).
- Shared-secret auth between plugin and backend (replaced in 0.7.0 by JWT).

### Tests
- backend 11/11 bun, plugin 4/4 phpunit, plugin-app 4/4 vitest.

[Unreleased]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.8.0-recurring-billing...v1.1.0
[0.8.0-recurring-billing]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.7.0-jwt-auth...v0.8.0-recurring-billing
[0.7.0-jwt-auth]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.6.0-bulk-decouple...v0.7.0-jwt-auth
[0.6.0-bulk-decouple]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.5.1-3c-polish...v0.6.0-bulk-decouple
[0.5.1-3c-polish]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.5.0-3c-bulk-engine...v0.5.1-3c-polish
[0.5.0-3c-bulk-engine]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.4.0-3b-craft-pipeline...v0.5.0-3c-bulk-engine
[0.4.0-3b-craft-pipeline]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.3.0-3a-writes-audit-rollback...v0.4.0-3b-craft-pipeline
[0.3.0-3a-writes-audit-rollback]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.2.0-read-tools...v0.3.0-3a-writes-audit-rollback
[0.2.0-read-tools]: https://github.com/getseoagent/wp-ai-seo-agent/compare/v0.1.0-walking-skeleton...v0.2.0-read-tools
[0.1.0-walking-skeleton]: https://github.com/getseoagent/wp-ai-seo-agent/releases/tag/v0.1.0-walking-skeleton
