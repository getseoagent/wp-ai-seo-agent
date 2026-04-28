# Self-hosting the AI SEO Agent backend

The plugin is a thin client. The chat dialog, the agent loop, license verification, and recurring billing all run on a Node (Bun + Hono) backend that ships in `backend/` of this repo. You can use the managed instance run by SEO-FRIENDLY (the default `SEO_AGENT_BACKEND_URL` in the plugin), or you can self-host the backend on your own infrastructure.

This document covers the self-host path.

## What the backend needs

| | |
|---|---|
| Runtime          | Bun ≥ 1.3 (single binary; Node won't work — code uses `Bun.SQL` and Bun-specific HTTP) |
| Database         | Postgres 14+ (uses `JSONB`, partial indexes, `INTERVAL` arithmetic) |
| Outbound network | Anthropic API (`api.anthropic.com`), WayForPay (`api.wayforpay.com`), Brevo (`api.brevo.com`), and your WP install (`WP_BASE_URL`) |
| Inbound network  | Whatever serves `:8787` to the plugin — typically nginx or Caddy reverse-proxy with TLS |
| Disk             | < 1 GB; sessions table grows linearly with chat traffic and is pruned daily |
| RAM              | ~50 MB idle, ~150 MB under chat load |

## Two deployment shapes

### A. Docker Compose (simplest)

```bash
git clone https://github.com/getseoagent/wp-ai-seo-agent
cd wp-ai-seo-agent/backend
cp .env.example .env
# Edit .env — see "Required env" below

docker compose up -d
docker compose logs -f backend
curl http://localhost:8787/health   # → {"status":"ok"}
```

`docker-compose.yml` brings up:
- the backend on `:8787`
- a Postgres on `:5432` with a named volume for data
- a network between them

Migrations apply on first boot. To stop and remove (data preserved): `docker compose down`. To wipe the DB too: `docker compose down -v`.

### B. systemd unit (no Docker)

Used by the managed instance at www.seo-friendly.org.

```bash
git clone https://github.com/getseoagent/wp-ai-seo-agent
cd wp-ai-seo-agent/backend
bun install --frozen-lockfile --production
cp .env.example .env
# Edit .env

# Provision the Postgres DB out-of-band:
sudo -u postgres createuser seoagent
sudo -u postgres createdb -O seoagent seoagent
sudo -u postgres createdb -O seoagent seoagent_test   # only if running tests
sudo -u postgres psql -c "ALTER USER seoagent WITH PASSWORD 'change-me';"

# Install + start the unit:
cd ..
sudo scripts/install-systemd.sh --start
journalctl -u seoagent-backend -f
```

The unit runs the backend as the `dev` user (edit if your conventions differ), restarts on failure, and survives reboot. Hardening flags (NoNewPrivileges, PrivateTmp, ProtectSystem) are pre-set.

## Required env

In every shape, `backend/.env` (or compose `env_file`) must have:

| Var | Constraint | What |
|---|---|---|
| `DATABASE_URL`         | required, ≥ 1 char | Postgres URL — `postgres://user:pass@host:5432/db` |
| `WP_BASE_URL`          | required          | URL of the WordPress install the backend talks to (e.g. `https://your-site.com`) |
| `JWT_SECRET`           | required, ≥ 32 chars | HS256 secret. **Must equal** `SEO_AGENT_JWT_SECRET` in your `wp-config.php`. Generate with `openssl rand -hex 32`. |
| `LICENSE_HMAC_SECRET`  | required, ≥ 32 chars | Signs license keys. Generate with `openssl rand -hex 32`. |
| `WAYFORPAY_MERCHANT_ACCOUNT`    | required          | WFP merchant account name |
| `WAYFORPAY_MERCHANT_SECRET_KEY` | required, ≥ 32 chars | WFP HMAC-MD5 secret. **Placeholder OK** if you don't need recurring billing yet. |
| `WAYFORPAY_DOMAIN`              | required          | Merchant domain registered with WFP |

Optional:

| Var | Default | What |
|---|---|---|
| `PORT`                            | `8787`  | Listen port |
| `JWT_TOKEN_TTL_SECONDS`           | `86400` | User-token lifetime |
| `JWT_SECRET_PREVIOUS`             | unset   | One-TTL acceptance window during a JWT_SECRET rotation |
| `BREVO_API_KEY`                   | unset   | If unset, transactional emails are skipped (warn-only) |
| `BILLING_CURRENCY`                | `USD`   | Currency for recurring charges |
| `SESSION_RETENTION_DAYS`          | `90`    | Daily prune threshold |
| `AUTH_TOKEN_RATE_LIMIT_PER_MIN`   | `10`    | Per-IP rate limit on the public `/auth/token` |
| `TEST_DATABASE_URL`               | unset   | Required by `bun test`; must differ from `DATABASE_URL` |
| `NODE_ENV`                        | `development` | Set to `production` in prod |

## Reverse-proxy config

The plugin → backend hop crosses the public internet, so the backend needs HTTPS. Minimal nginx:

```nginx
server {
  server_name backend.your-site.com;
  listen 443 ssl http2;
  # ...your TLS cert config...

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # SSE-friendly buffering
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
  }
}
```

`X-Forwarded-For` is what the rate-limit middleware reads to bucket per client IP. Without it the backend sees only the proxy's IP and rate-limits everyone together (still safe, just coarser).

## wp-config.php on the WordPress side

```php
define('SEO_AGENT_BACKEND_URL', 'https://backend.your-site.com');
define('SEO_AGENT_JWT_SECRET',  'paste the same JWT_SECRET as the backend env');
```

## Operations

| Want to… | Do |
|---|---|
| See logs                | `journalctl -u seoagent-backend -f`  /  `docker compose logs -f backend` |
| Restart                 | `sudo systemctl restart seoagent-backend`  /  `docker compose restart backend` |
| Apply schema changes    | Migrations run on every boot (idempotent). Just restart. |
| Rotate `JWT_SECRET`     | Set the OLD value to `JWT_SECRET_PREVIOUS`, set `JWT_SECRET` to the new one, restart. After 1× `JWT_TOKEN_TTL_SECONDS` (24h default), unset `JWT_SECRET_PREVIOUS`. |
| Backup                  | `pg_dump seoagent | gzip > backup.sql.gz` |
| Run tests               | `TEST_DATABASE_URL=postgres://.../seoagent_test bun test` from `backend/` |

## Sanity-checks

```bash
# health
curl https://backend.your-site.com/health

# mint a free-tier JWT (no auth)
curl -sX POST https://backend.your-site.com/auth/token \
  -H content-type:application/json \
  -d '{"license_key":null,"site_url":"https://your-site.com"}'

# the WP plugin should now successfully open the chat panel and stream
# Anthropic's response (assuming you've pasted your Anthropic API key into
# Settings, since this is a BYO-key product).
```

## Multi-instance scaling

The current implementation is **single-instance only**:
- Sessions live in Postgres (✓ multi-instance safe)
- Rate-limit buckets live in process memory (✗ each instance has its own; total throughput = N × per-IP-limit)
- Billing-worker runs unconditionally on every instance start (✗ N instances will all tick the same due rows; the per-row updates are idempotent but you'll waste WFP API calls)

For multi-instance, switch the rate-limit to a Redis-backed bucket and put the billing-worker behind a leader-election lock (or run it as a separate one-replica deployment). PRs welcome.

## Updating

```bash
cd /path/to/wp-ai-seo-agent
git pull
cd backend && bun install --frozen-lockfile --production
sudo systemctl restart seoagent-backend
# or:  docker compose pull && docker compose up -d
```

Schema changes apply on next boot via the in-tree migration runner. WP-config doesn't need to change unless the release notes say so.
