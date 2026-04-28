#!/usr/bin/env bash
#
# Install/refresh the systemd unit for the seoagent backend.
#
# Idempotent — re-running picks up edits in scripts/seoagent-backend.service.
# Requires sudo (writes to /etc/systemd/system).
#
# Usage: sudo scripts/install-systemd.sh [--start]
#   --start  also enable + start the unit after install (otherwise leaves
#            the operator to do `systemctl enable --now seoagent-backend`).

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/scripts/seoagent-backend.service"
DST="/etc/systemd/system/seoagent-backend.service"

if [[ "$EUID" -ne 0 ]]; then
  echo "This installer must run as root (use sudo)." >&2
  exit 1
fi
if [[ ! -f "$SRC" ]]; then
  echo "Missing source unit at $SRC" >&2; exit 1
fi
if [[ ! -f "$REPO/backend/.env" ]]; then
  echo "Missing $REPO/backend/.env — populate from .env.example before installing the unit." >&2
  exit 1
fi

install -m 644 "$SRC" "$DST"
systemctl daemon-reload
echo "Installed $DST"

if [[ "${1:-}" == "--start" ]]; then
  systemctl enable --now seoagent-backend.service
  sleep 1
  systemctl status seoagent-backend.service --no-pager | head -15
  echo
  curl -sf http://127.0.0.1:8787/health && echo "  ← health OK" || echo "WARN: /health not responding yet"
else
  echo "Run: sudo systemctl enable --now seoagent-backend.service"
fi
