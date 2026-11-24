#!/bin/sh
# Hourly refresh: fetch fresh data, redeploy to Cloudflare Pages,
# commit the new data.json to the repo (best effort).
set -e
cd "$(dirname "$0")/.."
./scripts/deploy.sh
git add public/data.json
if git diff --cached --quiet; then
  echo "data.json unchanged"
else
  git commit -m "Hourly data refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null
  git push origin main
fi
