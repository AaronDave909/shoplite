#!/usr/bin/env bash
# Start/stop the ShopLite stack with Docker Compose.
#   ./scripts/stack.sh up      build + start everything (Agent only if DD_API_KEY is set)
#   ./scripts/stack.sh logs    follow logs (add a service name to filter)
#   ./scripts/stack.sh down    stop everything (data volumes are kept)
#   ./scripts/stack.sh reset   stop and delete the database volumes (fresh seed data)
set -euo pipefail
cd "$(dirname "$0")/.."

cmd="${1:-up}"
shift || true

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Source Code Integration: tag every container with the commit it was built from.
# Push this commit to GitHub so Datadog can open the file at that SHA.
if git rev-parse HEAD >/dev/null 2>&1; then
  export DD_GIT_COMMIT_SHA="${DD_GIT_COMMIT_SHA:-$(git rev-parse HEAD)}"
  if [[ -n "$(git status --porcelain -- services)" ]]; then
    echo "Note: services/ has uncommitted changes; Datadog code links point at ${DD_GIT_COMMIT_SHA:0:7}." >&2
  fi
fi

case "$cmd" in
  up)
    services=()
    if [[ -z "${DD_API_KEY:-}" ]]; then
      echo "DD_API_KEY is not set: starting ShopLite without the Datadog Agent (nothing is sent to Datadog)." >&2
      services=(storefront-service checkout-service promo-service inventory-service)
    fi
    docker compose up -d --build "$@" ${services[@]+"${services[@]}"}
    docker compose ps
    echo
    echo "Storefront: http://localhost:3000"
    ;;
  down) docker compose down "$@" ;;
  reset) docker compose down -v "$@" ;;
  logs) docker compose logs -f --tail=100 "$@" ;;
  *)
    echo "Usage: $0 {up|down|reset|logs} [docker compose args]" >&2
    exit 1
    ;;
esac
