#!/usr/bin/env bash
# Runs every time the Codespace starts: launches the Datadog Agent container.
set -uo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DD_API_KEY:-}" ]]; then
  echo "DD_API_KEY is not set. Add it as a Codespaces secret for this repo"
  echo "(github.com → Settings → Codespaces → Secrets), then rebuild or restart the Codespace."
  echo "The app still runs without it, but nothing is sent to Datadog."
  exit 0
fi

# docker-in-docker can take a few seconds to come up.
for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done

mkdir -p logs
docker compose up -d datadog-agent && echo "Datadog Agent started. Now run: npm start"
