#!/usr/bin/env bash
# Offline tests for scriptable exit codes and JSON error envelope.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

TEST_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_SECRET_BACKEND=file
export ALTERTABLE_API_KEY=atm_test
export ALTERTABLE_ENV=production
cleanup() { rm -rf "${TEST_HOME}"; teardown_mock_http; }
trap cleanup EXIT

WHOAMI_OK='[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane\",\"email\":\"j@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
WHOAMI_401='[{"urlPattern":"/whoami","method":"GET","status":401,"body":"{\"error\":\"invalid key\"}"}]'
ENV_404='[{"urlPattern":"/environments/production/connections/missing","method":"GET","status":404,"body":"{\"error\":\"not found\"}"}]'
WHOAMI_403='[{"urlPattern":"/whoami","method":"GET","status":403,"body":"{\"error\":\"forbidden\"}"}]'
ENV_409='[{"urlPattern":"/service_accounts","method":"POST","status":409,"body":"{\"error\":\"conflict\"}"}]'
RATE_429='[{"urlPattern":"/whoami","method":"GET","status":429,"body":"{\"error\":\"rate limited\"}"}]'
VALIDATION_422='[{"urlPattern":"/service_accounts","method":"POST","status":422,"body":"{\"error\":\"validation failed\"}"}]'
WHOAMI_500='[{"urlPattern":"/whoami","method":"GET","status":500,"body":"{\"error\":\"internal server error\"}"}]'

# ── Success ──
setup_mock_http "${WHOAMI_OK}"
if ! OUT="$("${CLI}" --json context 2>/dev/null)"; then
  fail "success: --json context should exit 0"
fi
teardown_mock_http
echo "${OUT}" | jq -e '.principal.name == "Jane"' >/dev/null || fail "success: expected JSON principal"
pass "success: --json context exits 0"

# ── Auth (401 → exit 2) ──
setup_mock_http "${WHOAMI_401}"
set +e
STDERR="$("${CLI}" --json context 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -eq 2 ]] || fail "auth: expected exit 2, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 2 and .code == "auth_failed"' >/dev/null \
  || fail "auth: stderr should be JSON error envelope, got '${STDERR}'"
pass "auth: --json context exits 2 with JSON error on stderr"

# ── Not found (404 → exit 4) ──
setup_mock_http "${ENV_404}"
set +e
STDERR="$("${CLI}" --json api GET /environments/production/connections/missing 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -eq 4 ]] || fail "not found: expected exit 4, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 4' >/dev/null \
  || fail "not found: expected JSON error, got '${STDERR}'"
pass "not found: api GET missing connection exits 4"

# ── Forbidden (403 → exit 3) ──
setup_mock_http "${WHOAMI_403}"
set +e
STDERR="$("${CLI}" --json context 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -eq 3 ]] || fail "forbidden: expected exit 3, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 3 and .code == "forbidden"' >/dev/null \
  || fail "forbidden: stderr should be JSON error envelope, got '${STDERR}'"
pass "forbidden: --json context exits 3"

# ── Conflict (409 → exit 5) ──
setup_mock_http "${ENV_409}"
set +e
STDERR="$("${CLI}" --json api POST /service_accounts -f label=dup 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -eq 5 ]] || fail "conflict: expected exit 5, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 5 and .code == "conflict"' >/dev/null \
  || fail "conflict: expected JSON error, got '${STDERR}'"
pass "conflict: api POST /service_accounts exits 5 on 409"

# ── Rate limit (429 → exit 7) ──
setup_mock_http "${RATE_429}"
set +e
STDERR="$("${CLI}" --json context 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -eq 7 ]] || fail "rate limit: expected exit 7, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 7 and .code == "rate_limited"' >/dev/null \
  || fail "rate limit: expected JSON error, got '${STDERR}'"
pass "rate limit: --json context exits 7 on 429"

# ── Configuration (missing credentials → exit 10) ──
CONFIG_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${CONFIG_HOME}"
unset ALTERTABLE_API_KEY
unset ALTERTABLE_ENV
set +e
STDERR="$("${CLI}" --json api GET /whoami 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
rm -rf "${CONFIG_HOME}"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_API_KEY=atm_test
export ALTERTABLE_ENV=production
[[ "${EXIT_CODE}" -eq 10 ]] || fail "configuration: expected exit 10, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 10 and .code == "configuration_error"' >/dev/null \
  || fail "configuration: expected JSON error, got '${STDERR}'"
pass "configuration: --json api GET /whoami exits 10 without credentials"

# ── Validation (422 → exit 6) ──
setup_mock_http "${VALIDATION_422}"
set +e
STDERR="$("${CLI}" --json api POST /service_accounts -f label=bad 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -eq 6 ]] || fail "validation: expected exit 6, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 6 and .code == "validation_error"' >/dev/null \
  || fail "validation: expected JSON error, got '${STDERR}'"
pass "validation: api POST /service_accounts exits 6 on 422"

# ── Server error (500 → exit 8) ──
setup_mock_http "${WHOAMI_500}"
set +e
STDERR="$("${CLI}" --json context 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -eq 8 ]] || fail "server error: expected exit 8, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 8 and .code == "server_error"' >/dev/null \
  || fail "server error: expected JSON error, got '${STDERR}'"
pass "server error: --json context exits 8 on 500"

# ── Network (unreachable host → exit 9) ──
export ALTERTABLE_MANAGEMENT_API_BASE="http://127.0.0.1:1"
set +e
STDERR="$("${CLI}" --json context 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
unset ALTERTABLE_MANAGEMENT_API_BASE
[[ "${EXIT_CODE}" -eq 9 ]] || fail "network: expected exit 9, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 9 and .code == "network_error"' >/dev/null \
  || fail "network: expected JSON error, got '${STDERR}'"
pass "network: --json context exits 9 on unreachable host"

# ── Profile show missing (ConfigurationError → exit 10) ──
set +e
STDERR="$("${CLI}" --json profile show --name missing-profile 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
[[ "${EXIT_CODE}" -eq 10 ]] || fail "profile show missing: expected exit 10, got ${EXIT_CODE}"
echo "${STDERR}" | jq -e '.error == true and .exit_code == 10 and .code == "configuration_error"' >/dev/null \
  || fail "profile show missing: expected JSON error, got '${STDERR}'"
pass "profile show missing: exits 10 with configuration_error"

# ── Usage (missing required arg → exit 1) ──
set +e
STDERR="$("${CLI}" --json query 2>&1 >/dev/null)"
EXIT_CODE=$?
set -e
[[ "${EXIT_CODE}" -eq 1 ]] || fail "usage: expected exit 1, got ${EXIT_CODE}"
pass "usage: query without --statement exits 1"

# ── JSON error shape on failure ──
setup_mock_http "${WHOAMI_401}"
set +e
"${CLI}" --json context >/dev/null 2> /tmp/at_script_err.json
EXIT_CODE=$?
set -e
teardown_mock_http
[[ "${EXIT_CODE}" -ne 0 ]] || fail "json error shape: expected non-zero exit"
jq -e '.error == true' /tmp/at_script_err.json >/dev/null \
  || fail "json error shape: stderr must parse as JSON with error=true"
rm -f /tmp/at_script_err.json
pass "json error shape: failed --json call emits parseable JSON on stderr"

# ── stdout empty on failure ──
setup_mock_http "${WHOAMI_401}"
set +e
STDOUT="$("${CLI}" --json context 2>/dev/null)"
EXIT_CODE=$?
set -e
teardown_mock_http
[[ -z "${STDOUT}" ]] || fail "stdout should be empty on failure, got '${STDOUT}'"
pass "stdout is empty on --json failure"

echo ""
echo -e "${GREEN}All scripting tests passed.${NC}"
