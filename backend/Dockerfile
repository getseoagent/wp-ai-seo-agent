# syntax=docker/dockerfile:1.7

# Bun + Hono + Postgres-Bun.SQL. The image is alpine-based so the final size
# is ~95 MB, of which ~80 MB is the Bun runtime itself.
FROM oven/bun:1.3.13-alpine

WORKDIR /app

# Copy lockfile first so dep changes don't bust the layer cache on src edits.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Source + migrations applied at boot via runMigrations(getDb(), ./migrations).
COPY src ./src
COPY migrations ./migrations
COPY tsconfig.json ./

# Tests + eval/ are dev-only; they're excluded by .dockerignore.

# Drop privileges. The bun base image ships with a non-root `bun` user.
USER bun

EXPOSE 8787

# Bun reads .env from CWD by default. In production pass env via
# `docker run -e ...` or compose's environment / env_file, NOT via a
# bind-mounted .env (avoids leaking secrets through image layers).
CMD ["bun", "run", "src/index.ts"]
