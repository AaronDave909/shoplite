#!/usr/bin/env bash
# Runs once when the Codespace is created: installs deps and writes .env.
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci

if [[ ! -f .env ]]; then
  cp .env.example .env
  # Codespaces sets GITHUB_REPOSITORY (owner/name); use it for Source Code Integration.
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    sed -i "s#^DD_GIT_REPOSITORY_URL=.*#DD_GIT_REPOSITORY_URL=https://github.com/${GITHUB_REPOSITORY}#" .env
  fi
fi
