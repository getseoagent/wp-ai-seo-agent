# Contributing to AI SEO Agent

Thanks for picking up the codebase. This document covers the bare minimum to land a change without a CI failure.

For the architectural tour and deploy story see `README.md` and `docs/self-hosting.md`.

## Local setup

```bash
git clone https://github.com/getseoagent/wp-ai-seo-agent
cd wp-ai-seo-agent

# backend (Bun + Hono + Postgres)
cd backend
bun install
cp .env.example .env                                 # populate secrets
sudo -u postgres createdb -O seoagent seoagent
sudo -u postgres createdb -O seoagent seoagent_test  # required by `bun test`
bun test                                             # 212/212

# plugin (PHP)
cd ../plugin
composer install
/usr/bin/php8.3 vendor/bin/phpunit                   # 124/124
/usr/bin/php8.3 vendor/bin/phpcs                     # 0/0

# plugin-app (TS + React)
cd ../plugin-app
bun install
bun run test                                         # 38/38
bun run build                                        # → ../plugin/assets/dist/
```

CI runs the same four jobs (see `.github/workflows/ci.yml`). A green local run is a green PR.

## Project layout

| Directory      | Owns                                                                |
|----------------|---------------------------------------------------------------------|
| `backend/`     | Bun + Hono service. Agent loop, license server, billing worker.     |
| `plugin/`      | WordPress plugin (PHP). REST proxy, admin pages, JWT verifier.      |
| `plugin-app/`  | React admin chat UI. Bundled into `plugin/assets/dist/` by Vite.    |
| `scripts/`     | Build + ops scripts (wp.org ZIP, systemd unit installer).           |
| `docs/`        | Specs, plans, submission checklist, self-hosting guide.             |

## Coding standards

- **PHP** — WordPress Coding Standards (WPCS) via `plugin/phpcs.xml.dist`. Run `vendor/bin/phpcbf` before `phpcs`. Most violations auto-fix.
- **TypeScript** — strict mode on both backend and plugin-app. `bunx tsc --noEmit` must be green. We don't use a separate ESLint config; the React Hooks rule (built into Vite/React) plus tsc-strict catch the bulk.
- **Naming** — PHP code uses `seo_agent_*` / `SEO_AGENT_*` / `seoagent_` prefixes consistently. TS keeps camelCase even where WPCS would prefer snake_case (the codebase mirrors the backend's TS conventions; the phpcs ruleset has the snake_case sniff disabled with a documented rationale).

## Tests

| Layer       | Framework | Where                              |
|-------------|-----------|------------------------------------|
| Backend     | bun:test  | `backend/src/tests/*.test.ts`      |
| Plugin      | PHPUnit   | `plugin/tests/*.php`               |
| Plugin-app  | Vitest    | `plugin-app/src/**/*.test.{ts,tsx}` |

Backend tests need a separate Postgres DB (`TEST_DATABASE_URL`); the runtime safeguard at `backend/src/tests/_helpers/test-db.ts` refuses to run if it equals `DATABASE_URL`. Don't disable that check.

## i18n

User-facing strings on both sides MUST be wrapped:

- **PHP** — `__()` / `esc_html__()` / `esc_attr__()` with text-domain `'seo-agent'`.
- **TS/React** — import `{ __, _n, sprintf }` from `plugin-app/src/lib/i18n.ts` (the wrapper pins the text-domain so call sites stay terse).

To add a new translatable string:

```bash
# 1. wrap it in code
# 2. regenerate the .pot
cd plugin-app && bun run scripts/extract-i18n.ts > /tmp/js.pot.fragment
cd ../plugin
cp -r ../plugin-app/src .__pot_scan_src
wp i18n make-pot . languages/seo-agent.pot --slug=seo-agent --domain=seo-agent --skip-plugins --skip-themes --skip-packages
rm -rf .__pot_scan_src
cd ..
cat plugin/languages/seo-agent.pot /tmp/js.pot.fragment > /tmp/merged.pot
msguniq /tmp/merged.pot --to-code=UTF-8 -o plugin/languages/seo-agent.pot

# 3. add the new msgid to each locale catalog in plugin-app/scripts/build-translations.ts
# 4. regenerate .po + .mo + .json
cd plugin-app && bun run scripts/build-translations.ts
cd ../plugin/languages && for po in seo-agent-*.po; do msgfmt "$po" -o "${po%.po}.mo"; done
cd ../../plugin-app && bun run scripts/build-jed-json.ts
```

Currently bundled locales: `en` (source), `ru`, `uk`, `es`, `fr`, `pt_BR`.

## Commit + PR conventions

- One logical change per commit. Avoid omnibus "polish" commits unless explicitly batching mechanical changes.
- Conventional-style prefix in the subject is encouraged but not enforced: `feat(plugin): …`, `fix(backend): …`, `chore: …`.
- Body: explain the *why*, not the *what*. Diff already shows what.
- Include rationale for any `phpcs:ignore` / `eslint-disable` / TS `as any` you add.

## Releases

The plugin ships from `dist/seo-agent.zip`, built by `scripts/build-wporg-zip.sh`. The script asserts that the plugin header version, the `SEO_AGENT_VERSION` constant, and `Stable tag` in `readme.txt` agree before zipping — drift fails the build.

The backend ships either as a systemd unit (`scripts/install-systemd.sh`) or via Docker (`backend/Dockerfile` + `docker-compose.yml`); see `docs/self-hosting.md`.

## Where to look first

| Want to… | Start at |
|---|---|
| Add a new chat tool                       | `backend/src/lib/tools.ts` + `plugin/includes/class-rest-controller.php` (REST surface) |
| Add a new SEO-plugin adapter (Yoast etc.) | `plugin/includes/adapters/interface-seo-fields-adapter.php` |
| Tweak the agent loop                      | `backend/src/lib/agent-loop.ts` |
| Tweak the bulk-job state machine          | `backend/src/lib/job-runner.ts` + `plugin/includes/class-jobs-store.php` |
| Add a new license tier or tier-gated tool | `backend/src/lib/license/tier-gate.ts` |
| Add a new email template                  | `backend/src/lib/billing/emails/` + `index.ts` registry |
| Change the React chat UI                  | `plugin-app/src/components/Chat.tsx` |

## License

GPL-2.0-or-later. By contributing you agree your changes ship under that license.
