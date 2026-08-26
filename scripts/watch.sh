#!/usr/bin/env bash
# Auto-bump on save. Watches your source tree and runs bust.sh whenever
# a non-HTML file changes. HTML is excluded so the bust's own rewrite of
# <meta name="cb"> doesn't trigger a new bump (which would loop forever).
#
# Detects fswatch (mac) or inotifywait (linux). Falls back to a 1-second
# polling loop with `find -newer` if neither is installed — slower but works
# anywhere.
#
# Usage:
#   bash $SKILL_DIR/scripts/watch.sh [--target <dir>] [--paths "src components app"] [--debounce 200]
#
# Stop with Ctrl-C.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="."
PATHS_DEFAULT="src app components pages public styles lib"
PATHS=""
DEBOUNCE_MS=200

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)   TARGET="$2"; shift 2 ;;
    --paths)    PATHS="$2"; shift 2 ;;
    --debounce) DEBOUNCE_MS="$2"; shift 2 ;;
    --help|-h)
      cat <<EOF
usage: watch.sh [--target <dir>] [--paths "<dirs>"] [--debounce <ms>]

  --target <dir>     Project root (default: .)
  --paths "<dirs>"   Space-separated list of subdirs to watch (default: any of
                     src app components pages public styles lib that exist)
  --debounce <ms>    Wait this long after a change before bumping (default: 200)

Bumps the cache-bust token whenever a non-HTML file changes. Excludes HTML
to break the rewrite loop (the bust itself rewrites HTML).
EOF
      exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

cd "$TARGET"

# Resolve paths to actually-existing subdirs
RESOLVED=()
SOURCE="${PATHS:-$PATHS_DEFAULT}"
for p in $SOURCE; do
  [[ -d "$p" ]] && RESOLVED+=("$p")
done
if [[ ${#RESOLVED[@]} -eq 0 ]]; then
  echo "no watched directories exist under $TARGET" >&2
  echo "looked for: $SOURCE" >&2
  exit 1
fi

echo "watching: ${RESOLVED[*]}"
echo "(excludes *.html so the bust's rewrite of <meta name=\"cb\"> doesn't loop)"
echo "Ctrl-C to stop."
echo ""

BUST="$TARGET/scripts/bust.sh"
[[ -x "$BUST" ]] || BUST="$SKILL_DIR/scripts/bust.sh"

run_bust() {
  # Run the bust, suppress its own stdout to keep watch output clean.
  ( cd "$TARGET" && "$BUST" --quiet >/dev/null 2>&1 ) || true
  TOKEN=$(grep -oE 'content="[0-9a-f]{8}"' "$(find . -maxdepth 3 -name 'index.html' -o -name 'layout.tsx' -o -name 'layout.jsx' 2>/dev/null | head -1)" 2>/dev/null | head -1 | sed 's/content="//;s/"//')
  echo "$(date +%H:%M:%S)  bumped → ${TOKEN:-?}"
}

# Initial bump on launch — gives the user immediate feedback that the watcher is alive
run_bust

if command -v fswatch >/dev/null 2>&1; then
  fswatch -o --exclude '\.html$' --exclude '/cb-shapes/' --exclude '/node_modules/' \
          --exclude '\.git/' --exclude '/dist/' --exclude '/build/' --exclude '/\.next/' \
          --latency=$(awk "BEGIN { printf \"%.2f\", ${DEBOUNCE_MS}/1000 }") \
          "${RESOLVED[@]}" \
    | while read -r _; do run_bust; done
elif command -v inotifywait >/dev/null 2>&1; then
  inotifywait -m -r -q --format '%w%f' \
    --exclude '(\.html$|/cb-shapes/|/node_modules/|/\.git/|/dist/|/build/|/\.next/)' \
    -e modify,create,delete,move \
    "${RESOLVED[@]}" \
    | while read -r _; do
        sleep "$(awk "BEGIN { printf \"%.2f\", ${DEBOUNCE_MS}/1000 }")"
        run_bust
      done
else
  echo "no fswatch or inotifywait — using polling fallback (1s interval)" >&2
  echo "install fswatch (brew install fswatch) or inotify-tools for snappier response" >&2
  STAMP="/tmp/cb-watch.$$.stamp"
  touch -t 197001010000 "$STAMP"
  while true; do
    CHANGED=$(find "${RESOLVED[@]}" -type f -newer "$STAMP" \
              -not -name '*.html' -not -path '*/cb-shapes/*' \
              -not -path '*/node_modules/*' -not -path '*/.git/*' \
              -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.next/*' \
              2>/dev/null | head -1)
    if [[ -n "$CHANGED" ]]; then
      touch "$STAMP"
      run_bust
    fi
    sleep 1
  done
fi
