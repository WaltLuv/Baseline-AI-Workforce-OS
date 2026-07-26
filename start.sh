#!/usr/bin/env bash
# Start Baseline AI Workforce on this machine.
#
#   ./start.sh          dev server (hot reload)
#   ./start.sh prod     production build, then serve it
#
# Installs dependencies on first run. Nothing here talks to the network beyond
# npm install and whichever agents you have connected.

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Get it from https://nodejs.org (LTS), then run this again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run — installing dependencies…"
  npm install
fi

URL="http://127.0.0.1:4400"

open_when_ready() {
  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null "$URL"; then
      if command -v open >/dev/null 2>&1; then open "$URL"
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
      fi
      return
    fi
    sleep 1
  done
}

echo "Baseline AI Workforce → $URL"
open_when_ready &

if [ "${1:-dev}" = "prod" ]; then
  npm run build
  exec npm run start
else
  exec npm run dev
fi
