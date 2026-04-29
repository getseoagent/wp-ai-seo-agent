#!/usr/bin/env bash
#
# Build a wp.org-ready plugin ZIP at dist/seo-agent.zip.
#
# Inclusions: seo-agent.php, readme.txt, uninstall.php, LICENSE.txt,
#             includes/ (PHP), assets/dist/ (built JS+CSS bundle).
# Exclusions: .git/, vendor/, tests/, composer.*, phpunit.*, node_modules,
#             plugin-app/ (TS sources), backend/ (Node side), IDE/OS junk.
#
# After this runs you can hand dist/getseoagent.zip to the wp.org review form
# (https://wordpress.org/plugins/developers/add/) or test it locally on a
# clean WP install.
#
# Usage: scripts/build-wporg-zip.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$REPO/plugin"
DIST="$REPO/dist"
STAGE="$DIST/.stage/getseoagent"
ZIP_OUT="$DIST/getseoagent.zip"

if [[ ! -f "$PLUGIN/seo-agent.php" ]]; then
  echo "ERROR: $PLUGIN/seo-agent.php not found" >&2; exit 1
fi
if [[ ! -d "$PLUGIN/assets/dist" ]]; then
  echo "ERROR: $PLUGIN/assets/dist missing — run 'cd plugin-app && bun run build' first" >&2; exit 1
fi

# Sanity: header version must equal SEO_AGENT_VERSION constant must equal
# readme Stable tag. wp.org rejects mismatches.
HEADER_VER=$(awk -F'[ \t]+' '/^ \* Version:/ {print $4; exit}' "$PLUGIN/seo-agent.php")
DEFINE_VER=$(grep -oE "SEO_AGENT_VERSION', '[^']+" "$PLUGIN/seo-agent.php" | head -1 | cut -d"'" -f3)
README_VER=$(awk -F'[ \t]+' '/^Stable tag:/ {print $3; exit}' "$PLUGIN/readme.txt")
if [[ "$HEADER_VER" != "$DEFINE_VER" || "$HEADER_VER" != "$README_VER" ]]; then
  echo "ERROR: version mismatch — header=$HEADER_VER, define=$DEFINE_VER, readme=$README_VER" >&2
  exit 1
fi
echo "Building getseoagent.zip @ v$HEADER_VER"

rm -rf "$DIST"
mkdir -p "$STAGE"

# Whitelist copy — explicit list beats blacklist for "what shipped to wp.org"
cp "$PLUGIN/seo-agent.php"  "$STAGE/"
cp "$PLUGIN/readme.txt"     "$STAGE/"
cp "$PLUGIN/uninstall.php"  "$STAGE/"
cp "$PLUGIN/LICENSE.txt"    "$STAGE/"
cp -r "$PLUGIN/includes"    "$STAGE/"

# assets/dist holds the Vite bundle that admin-page.php enqueues. Source
# TS/TSX is in ../plugin-app/src and DOES NOT ship.
mkdir -p "$STAGE/assets"
cp -r "$PLUGIN/assets/dist" "$STAGE/assets/"

# Vite emits a placeholder index.html and a hidden `.vite/manifest.json`.
# - index.html is dev-server scaffolding the plugin doesn't load — drop it.
# - manifest.json is required by class-admin-page.php (it's how we resolve
#   the fingerprinted JS bundle name); promote it out of the hidden dir so
#   the ZIP has no dot-prefixed directories.
rm -f "$STAGE/assets/dist/index.html"
if [[ -f "$STAGE/assets/dist/.vite/manifest.json" ]]; then
  mv "$STAGE/assets/dist/.vite/manifest.json" "$STAGE/assets/dist/manifest.json"
  rmdir "$STAGE/assets/dist/.vite" 2>/dev/null || true
fi

# Languages directory ships:
#  - seo-agent.pot — translation template (for translators)
#  - seo-agent-{locale}.mo — compiled PHP translations
#  - seo-agent-{locale}-{md5}.json — Jed-format JS translations for
#    wp_set_script_translations()
# Source .po files do NOT ship — they're regenerated from build-translations.ts.
mkdir -p "$STAGE/languages"
if [[ -f "$PLUGIN/languages/seo-agent.pot" ]]; then
  cp "$PLUGIN/languages/seo-agent.pot" "$STAGE/languages/"
fi
shopt -s nullglob
for f in "$PLUGIN/languages/"*.mo "$PLUGIN/languages/"*.json; do
  cp "$f" "$STAGE/languages/"
done
shopt -u nullglob

# Strip noise that may have snuck in (defensive — every entry above is a
# whitelisted path, but cp -r can pull editor swap files).
find "$STAGE" \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*.swp' -o -name '*~' -o -name '.git*' \) -delete

# Final ZIP — root entry must be `getseoagent/` so unzip into wp-content/plugins/
# lands at /getseoagent.
( cd "$DIST/.stage" && zip -r "$ZIP_OUT" getseoagent >/dev/null )
rm -rf "$DIST/.stage"

# Sanity-print contents.
echo "OK → $ZIP_OUT"
echo
echo "=== ZIP top-level entries ==="
unzip -l "$ZIP_OUT" | awk 'NR>3 && $4 !~ /\// {print "  "$4}' | sort -u | head
echo "=== full file count ==="
unzip -l "$ZIP_OUT" | tail -1
echo "=== size ==="
ls -lh "$ZIP_OUT" | awk '{print "  "$5"  "$9}'
