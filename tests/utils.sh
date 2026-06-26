#!/bin/bash
# Test utilities for altertable CLI integration tests

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLI="${ALTERTABLE_BIN:-${REPO_ROOT}/bin/altertable}"

# ---------------------------------------------------------------------------
# HTTP request log (TypeScript CLI)
# ---------------------------------------------------------------------------

HTTP_LOG=""

setup_http_log() {
  _HTTP_LOG_DIR="$(mktemp -d)"
  HTTP_LOG="${_HTTP_LOG_DIR}/req.log"
  export ALTERTABLE_HTTP_LOG="${HTTP_LOG}"
  : > "${HTTP_LOG}"
}

teardown_http_log() {
  unset ALTERTABLE_HTTP_LOG
  rm -rf "${_HTTP_LOG_DIR:-}"
}

http_log_value() {
  local key="$1"
  grep "^${key}=" "${HTTP_LOG}" | tail -1 | cut -d= -f2-
}

http_log_payload() {
  http_log_value "PAYLOAD"
}

http_log_auth() {
  http_log_value "AUTH"
}

assert_http_log_auth_redacted() {
  local label="$1"
  grep -qF 'AUTH=Authorization: [REDACTED]' "${HTTP_LOG}" \
    || fail "${label}: expected redacted auth, got '$(grep '^AUTH=' "${HTTP_LOG}")'"
}

assert_http_log_has_no_secrets() {
  local label="$1"
  shift
  local secret
  for secret in "$@"; do
    if grep -qF "${secret}" "${HTTP_LOG}"; then
      fail "${label}: HTTP log leaked '${secret}'"
    fi
  done
}

http_log_url() {
  http_log_value "URL"
}

http_log_method() {
  http_log_value "METHOD"
}

# ---------------------------------------------------------------------------
# Mock HTTP responses (TypeScript CLI offline tests)
# ---------------------------------------------------------------------------

setup_mock_http() {
  _MOCK_HTTP_DIR="$(mktemp -d)"
  export ALTERTABLE_MOCK_HTTP_FILE="${_MOCK_HTTP_DIR}/mocks.json"
  printf '%s' "$1" > "${ALTERTABLE_MOCK_HTTP_FILE}"
}

setup_mock_http_file() {
  _MOCK_HTTP_DIR="$(mktemp -d)"
  export ALTERTABLE_MOCK_HTTP_FILE="${_MOCK_HTTP_DIR}/mocks.json"
  cp "$1" "${ALTERTABLE_MOCK_HTTP_FILE}"
}

teardown_mock_http() {
  unset ALTERTABLE_MOCK_HTTP_FILE
  rm -rf "${_MOCK_HTTP_DIR:-}"
}

# ---------------------------------------------------------------------------
# Curl spy (legacy — unused by default with TS CLI)
# ---------------------------------------------------------------------------

_CURL_SPY_DIR=""
_CURL_SPY_SAVED_PATH=""
CURL_PAYLOAD=""
CURL_RESPONSE=""

setup_curl_spy() {
  setup_http_log
  _CURL_SPY_DIR="${_HTTP_LOG_DIR}"
  _CURL_SPY_SAVED_PATH=""
  export _CURL_SPY_PAYLOAD_LOG="${HTTP_LOG}"
}

teardown_curl_spy() {
  teardown_http_log
  _CURL_SPY_DIR=""
}

run_with_curl_capture() {
  CURL_PAYLOAD=""
  CURL_RESPONSE=""
  setup_http_log
  CURL_RESPONSE=$("$@" 2>/dev/null)
  CURL_PAYLOAD="$(http_log_payload)"
}

assert_curl_payload_contains() {
  local label="$1"
  local pattern="$2"
  if ! echo "${CURL_PAYLOAD}" | grep -q "${pattern}"; then
    fail "${label}"
  fi
}

assert_curl_payload_not_contains() {
  local label="$1"
  local pattern="$2"
  if echo "${CURL_PAYLOAD}" | grep -q "${pattern}"; then
    fail "${label}"
  fi
}

assert_curl_payload_eq() {
  local label="$1"
  local expected="$2"
  local actual
  actual=$(echo "${CURL_PAYLOAD}" | jq -cS '.')
  expected=$(echo "${expected}" | jq -cS '.')
  [[ "${actual}" == "${expected}" ]] || fail "${label}: expected '${expected}', got '${actual}'"
}

assert_response_json_eq() {
  local label="$1"
  local jq_expr="$2"
  local expected="$3"
  local actual
  actual=$(echo "${CURL_RESPONSE}" | jq -r "${jq_expr}")
  [[ "${actual}" == "${expected}" ]] || fail "${label}: expected '${expected}', got '${actual}'"
}
