#!/usr/bin/env bash
# Runs every time the Codespace starts: builds and starts the ShopLite stack
# (four microservices, three Postgres databases and, with DD_API_KEY, the Datadog Agent).
set -uo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DD_API_KEY:-}" ]]; then
  echo "DD_API_KEY is not set. Add it as a Codespaces secret for this repo"
  echo "(github.com → Settings → Codespaces → Secrets), then rebuild or restart the Codespace."
  echo "The stack still starts without it, but nothing is sent to Datadog."
fi

# docker-in-docker can take a few seconds to come up.
for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done

./scripts/stack.sh up && echo "ShopLite is starting on port 3000. Logs: ./scripts/stack.sh logs"
