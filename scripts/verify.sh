#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_INTEGRATION=false
QUICK=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --integration)
      RUN_INTEGRATION=true
      shift
      ;;
    --quick)
      QUICK=true
      shift
      ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "Usage: $0 [--quick] [--integration]" >&2
      exit 1
      ;;
  esac
done

run_step() {
  local name="$1"
  shift
  echo "→ ${name}"
  if ! "$@"; then
    echo "✗ verify failed at: ${name}" >&2
    exit 1
  fi
}

check_mock_server() {
  if ! (echo >/dev/tcp/127.0.0.1/15000) 2>/dev/null; then
    echo "✗ integration requires mock server at http://0.0.0.0:15000" >&2
    echo "  Start with: docker run -d --rm --name at-mock -p 15000:15000 \\" >&2
    echo "    -e ALTERTABLE_MOCK_USERS=testuser:testpass \\" >&2
    echo "    ghcr.io/altertable-ai/altertable-mock:latest" >&2
    exit 1
  fi
}

cd "${REPO_ROOT}/cli"

run_step "install deps" bun install --frozen-lockfile
run_step "typecheck" bun run typecheck
run_step "lint" bun run lint
run_step "format:check" bun run format:check
run_step "generate (openapi)" bun run generate
run_step "openapi drift check" git diff --exit-code src/generated/openapi-types.ts src/generated/openapi-operations.ts
run_step "unit tests with coverage" bun run test:coverage
run_step "knip" bun run knip

if [[ "${QUICK}" == true ]]; then
  echo "✓ verify passed"
  exit 0
fi

run_step "build" bun run build
run_step "pack:check" bun run pack:check

chmod +x "${REPO_ROOT}/bin/altertable"
run_step "altertable --version" "${REPO_ROOT}/bin/altertable" --version
run_step "altertable --help" "${REPO_ROOT}/bin/altertable" --help

cd "${REPO_ROOT}"
for script in configure management context catalogs lakehouse scripting profile; do
  run_step "tests/${script}_test.sh" "./tests/${script}_test.sh"
done

if [[ "${RUN_INTEGRATION}" == true ]]; then
  check_mock_server
  run_step "tests/integration_test.sh" "./tests/integration_test.sh"
fi

echo "✓ verify passed"
