#!/usr/bin/env bash
# One-command deploy: refresh data, regenerate the share image, deploy.
# Usage: ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/fetch-data.mjs
python3 scripts/make-og.py
# cf_api.py needs blake3 from user site-packages; exec env sets PYTHONNOUSERSITE=1
env -u PYTHONNOUSERSITE python3 ~/workspace/custom-connectors/custom.cloudflare/bin/cf_api.py deploy public 3cd35f7778841d081c1b27a5c3ab8577 taskmarket-visualizer
