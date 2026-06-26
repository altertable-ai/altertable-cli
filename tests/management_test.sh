#!/usr/bin/env bash
# Offline tests for the management API helpers (whoami / catalogs share these).
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

TEST_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_SECRET_BACKEND=file
unset ALTERTABLE_API_KEY ALTERTABLE_ENV ALTERTABLE_MANAGEMENT_API_BASE 2>/dev/null || true
cleanup() { rm -rf "${TEST_HOME}"; teardown_http_log; teardown_mock_http; }
trap cleanup EXIT

WHOAMI_MOCK='[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane\",\"email\":\"j@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
PROFILE_CONFIG="${TEST_HOME}/profiles/default/config"

# ── Bearer auth from stored api-key, default base URL ──
"${CLI}" configure --api-key atm_stored --env production >/dev/null 2>&1
setup_http_log
setup_mock_http "${WHOAMI_MOCK}"
"${CLI}" whoami >/dev/null 2>&1
assert_http_log_auth_redacted "mgmt: stored Bearer api-key"
assert_http_log_has_no_secrets "mgmt: stored Bearer api-key" "atm_stored"
grep -q '^URL=https://app.altertable.ai/rest/v1/whoami$' "${HTTP_LOG}" || fail "mgmt: expected default base /whoami URL, got '$(grep '^URL=' "${HTTP_LOG}")'"
teardown_mock_http
teardown_http_log
pass "management auth uses stored Bearer api-key against the default base URL"

# ── ALTERTABLE_API_KEY overrides the stored key; ALTERTABLE_MANAGEMENT_API_BASE (a root) overrides base ──
setup_http_log
setup_mock_http "${WHOAMI_MOCK}"
ALTERTABLE_API_KEY=atm_env ALTERTABLE_MANAGEMENT_API_BASE=http://localhost:9 \
  "${CLI}" whoami >/dev/null 2>&1
assert_http_log_auth_redacted "mgmt: ALTERTABLE_API_KEY should win"
assert_http_log_has_no_secrets "mgmt: ALTERTABLE_API_KEY should win" "atm_env" "atm_stored"
grep -q '^URL=http://localhost:9/rest/v1/whoami$' "${HTTP_LOG}" || fail "mgmt: expected root + /rest/v1, got '$(grep '^URL=' "${HTTP_LOG}")'"
teardown_mock_http
teardown_http_log
pass "ALTERTABLE_MANAGEMENT_API_BASE is a root; the CLI appends /rest/v1"

# ── stored management_api_base (a root) is used when no env var is set ──
printf 'management_api_base=http://localhost:7\n' >> "${PROFILE_CONFIG}"
setup_http_log
setup_mock_http "${WHOAMI_MOCK}"
ALTERTABLE_API_KEY=atm_env "${CLI}" whoami >/dev/null 2>&1
grep -q '^URL=http://localhost:7/rest/v1/whoami$' "${HTTP_LOG}" || fail "mgmt: stored root should be used, got '$(grep '^URL=' "${HTTP_LOG}")'"
teardown_mock_http
teardown_http_log
pass "a stored management_api_base root is honored"

# ── a trailing slash on the root is trimmed ──
setup_http_log
setup_mock_http "${WHOAMI_MOCK}"
ALTERTABLE_API_KEY=atm_env ALTERTABLE_MANAGEMENT_API_BASE=http://localhost:8/ \
  "${CLI}" whoami >/dev/null 2>&1
grep -q '^URL=http://localhost:8/rest/v1/whoami$' "${HTTP_LOG}" || fail "mgmt: trailing slash should be trimmed, got '$(grep '^URL=' "${HTTP_LOG}")'"
teardown_mock_http
teardown_http_log
pass "a trailing slash on the control-plane root is trimmed"

# ── 500 with an HTML body: friendly message, HTML never leaked ──
"${CLI}" configure --api-key atm_stored --env production >/dev/null 2>&1
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","status":500,"body":"<html><body>Internal Server Error</body></html>"}]'
ERR="$("${CLI}" whoami 2>&1 >/dev/null)"
teardown_mock_http
echo "${ERR}" | grep -q "Server error (500)" || fail "500: expected friendly server error, got '${ERR}'"
echo "${ERR}" | grep -q "<html>" && fail "500: HTML body must not be displayed, got '${ERR}'"
pass "a 5xx HTML error page shows a friendly message and never leaks the HTML"

# ── 401 with a JSON body: friendly message + extracted message ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","status":401,"body":"{\"error\":{\"message\":\"invalid api key\"}}"}]'
ERR="$("${CLI}" whoami 2>&1 >/dev/null)"
teardown_mock_http
echo "${ERR}" | grep -q "Authentication failed (401)" || fail "401: expected auth-failed message, got '${ERR}'"
echo "${ERR}" | grep -q "invalid api key" || fail "401: expected extracted JSON message, got '${ERR}'"
pass "a 401 shows an authentication message and the JSON error detail"

# ── 404 with a JSON body lacking a message: friendly message, no HTML leak ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","status":404,"body":"{\"error\":{\"code\":\"not_found\"}}"}]'
ERR="$("${CLI}" whoami 2>&1 >/dev/null)"
teardown_mock_http
echo "${ERR}" | grep -q "Not found (404)" || fail "404: expected not-found message, got '${ERR}'"
pass "a 404 shows a not-found message"

# ── no api-key configured → clear error ──
"${CLI}" configure --clear >/dev/null 2>&1
ERR="$("${CLI}" whoami 2>&1 >/dev/null)"
echo "${ERR}" | grep -q "No management API key" || fail "mgmt: expected 'No management API key' error, got '${ERR}'"
pass "missing management API key errors clearly"

# ── HTTP invocations (reconfigure auth + env) ──
"${CLI}" configure --api-key atm_stored --env production >/dev/null 2>&1
export ALTERTABLE_API_KEY=atm_test
export ALTERTABLE_ENV=production

# ── HTTP invocations (gh api-style) ──
SA_CREATE_MOCK='[{"urlPattern":"/service_accounts","method":"POST","body":"{\"service_account\":{\"id\":\"sa_1\",\"label\":\"CI Bot\",\"slug\":\"ci-bot\"}}"}]'
setup_http_log
setup_mock_http "${SA_CREATE_MOCK}"
OUT="$("${CLI}" api POST /service_accounts -f label="CI Bot" 2>/dev/null)"
PAYLOAD="$(grep '^PAYLOAD=' "${HTTP_LOG}" | sed 's/^PAYLOAD=//')"
[[ "$(printf '%s' "$PAYLOAD" | jq -cS '.')" == '{"label":"CI Bot"}' ]] || fail "sa create: wrong payload '${PAYLOAD}'"
echo "${OUT}" | grep -Fq 'CI Bot' || fail "sa create: missing response content '${OUT}'"
teardown_mock_http
teardown_http_log
pass "api POST /service_accounts supports -f fields"

# ── databases create via HTTP ──
DB_CREATE_MOCK='[{"urlPattern":"/environments/production/databases","method":"POST","body":"{\"database\":{\"id\":\"db_1\",\"name\":\"Analytics\",\"slug\":\"analytics\",\"catalog\":\"analytics\"}}"}]'
setup_http_log
setup_mock_http "${DB_CREATE_MOCK}"
OUT="$("${CLI}" api POST /environments/production/databases -f name=Analytics 2>/dev/null)"
PAYLOAD="$(grep '^PAYLOAD=' "${HTTP_LOG}" | sed 's/^PAYLOAD=//')"
[[ "$(printf '%s' "$PAYLOAD" | jq -cS '.')" == '{"name":"Analytics"}' ]] || fail "db create: wrong payload '${PAYLOAD}'"
echo "${OUT}" | grep -Fq 'Analytics' || fail "db create: missing response content '${OUT}'"
teardown_mock_http
teardown_http_log
pass "api POST /environments/production/databases supports -f fields"

# ── credentials user-create via HTTP; human output omits password ──
CRED_CREATE_MOCK='[{"urlPattern":"/users/user_1/environments/production/credentials","method":"POST","body":"{\"credential\":{\"id\":\"cred_1\",\"label\":\"default\",\"username\":\"user_123\"},\"password\":\"secret-once\"}"}]'
setup_mock_http "${CRED_CREATE_MOCK}"
OUT="$("${CLI}" api POST /users/user_1/environments/production/credentials -f label=default 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'default' || fail "cred create: missing response content '${OUT}'"
echo "${OUT}" | grep -Fq "secret-once" && fail "cred create: password leaked in human output '${OUT}'"
pass "api POST credentials supports -f without leaking password"

echo ""
echo -e "${GREEN}All management tests passed.${NC}"
