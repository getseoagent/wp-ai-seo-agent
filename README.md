# AI SEO Agent for WordPress

Bulk SEO rewrites through chat. Sample-and-extrapolate UX over RankMath, Yoast, AIOSEO, or SEOPress.

This is a thin **WordPress plugin** + **Node backend** + **React admin app**, with a clean separation: the plugin is wp.org-distributable, the backend runs server-side (managed by us or self-hosted), and the React app is bundled into the plugin's `assets/dist`.

## Repo layout

| Directory | Language | What |
|---|---|---|
| `plugin/`     | PHP 8.1   | WordPress plugin — REST proxy, admin pages, JWT verifier, adapters |
| `plugin-app/` | TS + React | Admin chat UI; built into `plugin/assets/dist` by Vite |
| `backend/`    | TS + Bun + Hono | Node service — agent loop, license server, billing worker |
| `scripts/`    | bash      | Build + ops scripts (wp.org ZIP, systemd unit installer) |
| `docs/`       | markdown  | Specs, plans, submission checklist |

## Plugin (wp.org-distributable)

```bash
cd plugin
composer install                                         # phpunit + WPCS
/usr/bin/php8.3 vendor/bin/phpunit                       # 122/122
/usr/bin/php8.3 vendor/bin/phpcs                         # 0 errors / 0 warnings
```

Build a wp.org-ready ZIP at `dist/seo-agent.zip`:

```bash
scripts/build-wporg-zip.sh
```

Excludes `vendor/`, `tests/`, `composer.*`, `phpunit.*`, IDE/OS junk by construction (whitelist, not blacklist). Asserts header / `SEO_AGENT_VERSION` / `Stable tag` agree before zipping.

## Plugin-app (admin chat UI)

```bash
cd plugin-app
bun install
bun run test                                             # 37/37 vitest
bun run build                                            # → ../plugin/assets/dist/
```

The build emits a fingerprinted JS bundle plus a `manifest.json` that the plugin reads at enqueue time to resolve the actual filename.

## Backend (managed or self-hosted)

```bash
cd backend
bun install
cp .env.example .env                                     # populate secrets
TEST_DATABASE_URL=postgres://.../seoagent_test bun test  # 207/207
bun run src/index.ts                                     # listen on :8787
```

### Required env

| Var | What |
|---|---|
| `DATABASE_URL`         | Postgres for sessions + licenses |
| `TEST_DATABASE_URL`    | Separate DB for `bun test` (refuses to run if equal to `DATABASE_URL`) |
| `JWT_SECRET`           | HS256 secret; **must equal** `SEO_AGENT_JWT_SECRET` in `wp-config.php` |
| `LICENSE_HMAC_SECRET`  | Secret for HMAC-signed license keys |
| `WP_BASE_URL`          | URL of the WordPress site the backend talks to |
| `WAYFORPAY_*`          | Merchant credentials (placeholders OK until you have real ones) |

Optional:

| Var | Default | What |
|---|---|---|
| `JWT_TOKEN_TTL_SECONDS`  | 86400 | User-token lifetime |
| `JWT_SECRET_PREVIOUS`    | unset | One-TTL acceptance window during rotation |
| `BREVO_API_KEY`          | unset | If unset, transactional emails are skipped (warn) |
| `BILLING_CURRENCY`       | USD   | Currency for recurring charges |
| `SESSION_RETENTION_DAYS` | 90    | Daily prune threshold |

### Running as a service (Linux + systemd)

```bash
sudo scripts/install-systemd.sh --start
sudo systemctl status seoagent-backend
journalctl -u seoagent-backend -f
```

Unit auto-restarts on crash, survives reboot, runs as `dev` user with hardening (NoNewPrivileges, PrivateTmp, ProtectSystem=strict, ProtectHome=read-only, etc.).

### wp-config.php (plugin side)

```php
define('SEO_AGENT_BACKEND_URL', 'https://your-backend.example');  // or http://localhost:8787 for dev
define('SEO_AGENT_JWT_SECRET',  'same 32-byte hex as backend JWT_SECRET');
```

## Architecture in one paragraph

The plugin mints a user-JWT via `POST /auth/token` on the backend (using `SEO_AGENT_JWT_SECRET`-signed service tokens for backend→plugin REST), caches it in `wp_options` (encrypted with `AUTH_KEY`), and presents it as `Authorization: Bearer` on `POST /chat`. The chat handler streams SSE through the plugin's PHP cURL proxy. Inside the agent loop, tools call back into the plugin's REST API (also Bearer-authed via service-JWTs) to read posts, write SEO fields, record audit history, and run bulk jobs. License verification + recurring billing live entirely on the backend; the plugin's Subscription tab reads `/license/<key>/details` and posts to `/license/<key>/cancel`.

## Status

| Component | Version | State |
|---|---|---|
| Plugin    | 1.0.0 | wp.org-prep complete; pending design assets + Plugin Check upload |
| Backend   | live  | systemd-managed at https://www.seo-friendly.org's host |
| Plugin-app| bundled | 37/37 vitest |

Plan tracker: `docs/superpowers/plans/`. Submission checklist: `docs/wporg-submission-checklist.md`.

## License

GPL-2.0-or-later — see `plugin/LICENSE.txt`.
