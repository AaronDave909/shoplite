#!/usr/bin/env bash
# Starts ShopLite with the Datadog tracer, loading .env and stamping the git commit
# so Datadog's Source Code Integration can link stack frames to GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "No .env found. Run: cp .env.example .env  (then edit it)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if git rev-parse HEAD >/dev/null 2>&1; then
  export DD_GIT_COMMIT_SHA="${DD_GIT_COMMIT_SHA:-$(git rev-parse HEAD)}"
fi

exec node --require dd-trace/init src/server.js
