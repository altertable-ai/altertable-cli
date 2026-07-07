#!/usr/bin/env bash
# Offline tests for `altertable configure`. No network, no real keychain.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

TEST_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_SECRET_BACKEND=file
unset ALTERTABLE_LAKEHOUSE_USERNAME ALTERTABLE_LAKEHOUSE_PASSWORD \
      ALTERTABLE_BASIC_AUTH_TOKEN ALTERTABLE_API_BASE 2>/dev/null || true

cleanup() { rm -rf "${TEST_HOME}"; teardown_http_log; teardown_mock_http; }
trap cleanup EXIT

file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

CONFIG_FILE="${TEST_HOME}/config"
CRED_FILE="${TEST_HOME}/credentials"
PROFILE_CONFIG="${TEST_HOME}/profiles/default/config"

WHOAMI_MOCK='[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane\",\"email\":\"j@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
QUERY_MOCK='[{"urlPattern":"/query","method":"POST","body":"{}"}]'

# ── Lakehouse credential (user/password) ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u_blabla --password s_llll >/dev/null 2>&1
grep -q '^user=u_blabla$' "${PROFILE_CONFIG}" || fail "configure: expected user=u_blabla in profile config"
grep -q '^profile/default/lakehouse/password=s_llll$' "${CRED_FILE}" || fail "configure: expected profile-scoped password in credentials"
[[ "$(file_mode "${CRED_FILE}")" == "600" ]] || fail "configure: credentials must be mode 600, got $(file_mode "${CRED_FILE}")"
pass "configure stores lakehouse user/password (credentials chmod 600)"

# ── Basic token ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --basic-token dG9rZW4= >/dev/null 2>&1
grep -q '^profile/default/lakehouse/basic-token=dG9rZW4=$' "${CRED_FILE}" || fail "configure: expected basic-token in credentials"
pass "configure stores a Basic token"

# ── Management API key (per --env) ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --api-key atm_prod --env production >/dev/null 2>&1
grep -q '^profile/default/api-key=atm_prod$' "${CRED_FILE}" || fail "configure: expected api-key in credentials"
grep -q '^api_key_env=production$' "${PROFILE_CONFIG}" || fail "configure: expected api_key_env=production in profile config"
pass "configure stores an API key with its environment"

# ── Separate mechanisms accumulate (lakehouse + management API key) ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u1 --password p1 >/dev/null 2>&1
"${CLI}" configure --api-key atm_x --env prod >/dev/null 2>&1
grep -q '^user=u1$' "${PROFILE_CONFIG}" || fail "cumulation: lakehouse user should remain"
grep -q '^profile/default/lakehouse/password=p1$' "${CRED_FILE}" || fail "cumulation: lakehouse password should remain"
grep -q '^profile/default/api-key=atm_x$' "${CRED_FILE}" || fail "cumulation: api-key should be stored"
pass "lakehouse and management credentials can coexist in one profile"

# ── Same-mechanism override: new API key replaces previous ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --api-key atm_x --env prod >/dev/null 2>&1
"${CLI}" configure --api-key atm_y --env staging >/dev/null 2>&1
if grep -q 'atm_x' "${CRED_FILE}"; then fail "override: previous api-key should be gone"; fi
grep -q '^profile/default/api-key=atm_y$' "${CRED_FILE}" || fail "override: api-key should be stored"
grep -q '^api_key_env=staging$' "${PROFILE_CONFIG}" || fail "override: env should be updated"
pass "a new configure overrides the previous credential of the same type"

# ── Single-mechanism validation ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
if "${CLI}" configure --user u --password p --api-key k --env e >/dev/null 2>&1; then
  fail "should reject combining mechanisms"
fi
pass "configure rejects combining authentication mechanisms"
if "${CLI}" configure --user u --password p --env prod >/dev/null 2>&1; then
  fail "--env without --api-key should error"
fi
pass "--env is rejected without --api-key"
if "${CLI}" configure --api-key k >/dev/null 2>&1; then
  fail "--api-key without --env should error"
fi
pass "--api-key without --env is rejected"
if "${CLI}" configure --user u >/dev/null 2>&1; then
  fail "--user without --password should error"
fi
pass "--user without --password is rejected"

# ── stdin secrets ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
printf 's_fromstdin' | "${CLI}" configure --user alice --password-stdin >/dev/null 2>&1
grep -q '^profile/default/lakehouse/password=s_fromstdin$' "${CRED_FILE}" || fail "--password-stdin should store the piped password"
pass "--password-stdin reads the password from stdin"
printf 'atm_fromstdin' | "${CLI}" configure --api-key-stdin --env prod >/dev/null 2>&1
grep -q '^profile/default/api-key=atm_fromstdin$' "${CRED_FILE}" || fail "--api-key-stdin should store the piped key"
pass "--api-key-stdin reads the API key from stdin"

# ── configure --show ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u_blabla --password s_llll >/dev/null 2>&1
OUT="$("${CLI}" configure --show 2>/dev/null)"
echo "${OUT}" | grep -q 'u_blabla' || fail "--show: should show the username"
echo "${OUT}" | grep -Eq 'password:[[:space:]]*set' || fail "--show: should show password as set"
if echo "${OUT}" | grep -q 's_llll'; then fail "--show: must NOT print the secret value"; fi
echo "${OUT}" | grep -Fq "${CRED_FILE}" || fail "--show: should show the credentials file path as the secret store"
"${CLI}" configure --show >/dev/null 2>&1 || fail "--show: should exit 0"
pass "--show shows the stored mechanism, masks secrets, names the secret store, exits 0"

# ── non-TTY bare configure rejects without flags ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
ERR="$("${CLI}" configure 2>&1 >/dev/null)" && fail "bare configure without TTY should error"
echo "${ERR}" | grep -q 'Interactive configure requires a TTY' || fail "expected non-TTY error, got '${ERR}'"
pass "bare configure without TTY requires flags"

# ── flag-based configure stores lakehouse credentials ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user alice --password secret >/dev/null 2>&1
grep -q '^user=alice$' "${PROFILE_CONFIG}" || fail "flags: should store the username"
grep -q '^profile/default/lakehouse/password=secret$' "${CRED_FILE}" || fail "flags: should store the password"
pass "flag-based configure stores lakehouse credentials"

# ── configure --verify (management) ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
setup_http_log
setup_mock_http "${WHOAMI_MOCK}"
"${CLI}" configure --api-key atm_x --env prod --control-plane-url http://localhost:13000 --verify >/dev/null 2>&1 || fail "--verify should exit 0 on successful context lookup"
teardown_mock_http
teardown_http_log
pass "--verify checks management credentials after save"

# ── stored credentials drive authentication ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user alice --password secret >/dev/null 2>&1
setup_http_log
setup_mock_http "${QUERY_MOCK}"
"${CLI}" query --statement "SELECT 1" >/dev/null 2>&1
assert_http_log_auth_redacted "auth: stored lakehouse credentials"
STORED_BASIC_TOKEN="$(printf '%s' 'alice:secret' | base64 | tr -d '\n')"
assert_http_log_has_no_secrets "auth: stored lakehouse credentials" "secret" "${STORED_BASIC_TOKEN}"
teardown_mock_http
teardown_http_log
pass "commands authenticate with stored lakehouse credentials"

setup_http_log
setup_mock_http "${QUERY_MOCK}"
ALTERTABLE_LAKEHOUSE_USERNAME=envuser ALTERTABLE_LAKEHOUSE_PASSWORD=envpass \
  "${CLI}" query --statement "SELECT 1" >/dev/null 2>&1
assert_http_log_auth_redacted "auth: env vars should beat stored creds"
ENV_BASIC_TOKEN="$(printf '%s' 'envuser:envpass' | base64 | tr -d '\n')"
assert_http_log_has_no_secrets "auth: env vars should beat stored creds" "secret" "${ENV_BASIC_TOKEN}"
teardown_mock_http
teardown_http_log
pass "environment variables take precedence over stored credentials"

# ── refuse to read a credentials file with permissions looser than 600 ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u --password p >/dev/null 2>&1
chmod 644 "${CRED_FILE}"
ERR="$("${CLI}" configure --show 2>&1 >/dev/null)" && fail "--show should refuse a 644 credentials file"
echo "${ERR}" | grep -q 'too open' || fail "expected a 'too open' error, got '${ERR}'"
pass "--show refuses a credentials file looser than 600"
setup_http_log
setup_mock_http "${QUERY_MOCK}"
if "${CLI}" query --statement "SELECT 1" >/dev/null 2>&1; then fail "query should refuse a 644 credentials file"; fi
teardown_mock_http
teardown_http_log
pass "commands refuse to use a credentials file looser than 600"
chmod 600 "${CRED_FILE}"
"${CLI}" configure --show >/dev/null 2>&1 || fail "--show should accept a 600 credentials file"
pass "a 600 credentials file is accepted"

# ── configure --clear (non-interactive full reset) ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u --password p >/dev/null 2>&1
"${CLI}" configure --clear >/dev/null 2>&1 || fail "--clear should exit 0"
if [[ -f "${CONFIG_FILE}" ]]; then fail "--clear should remove the config file"; fi
if [[ -f "${CRED_FILE}" ]]; then fail "--clear should remove the credentials file"; fi
echo "$("${CLI}" configure --show 2>/dev/null)" | grep -q 'No credentials configured' || fail "--clear should leave no credentials"
pass "--clear removes all stored configuration without prompting"

# ── endpoints stored alongside a credential ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --api-key atm_x --env prod --control-plane-url http://localhost:13000 >/dev/null 2>&1
grep -q '^management_api_base=http://localhost:13000$' "${PROFILE_CONFIG}" || fail "endpoints: control-plane root should be stored verbatim"
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u --password p --data-plane-url http://localhost:15000 >/dev/null 2>&1
grep -q '^api_base=http://localhost:15000$' "${PROFILE_CONFIG}" || fail "endpoints: data-plane base should be stored"
pass "configure stores endpoints alongside a credential"

# ── stored control-plane root gains /rest/v1 at request time ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --api-key atm_x --env prod --control-plane-url http://localhost:13000 >/dev/null 2>&1
setup_http_log
setup_mock_http "${WHOAMI_MOCK}"
"${CLI}" context >/dev/null 2>&1
URL="$(http_log_url)"
teardown_mock_http
teardown_http_log
[[ "${URL}" == "http://localhost:13000/rest/v1/whoami" ]] || fail "endpoints: expected stored root + /rest/v1/whoami, got '${URL}'"
pass "a stored control-plane root resolves to <root>/rest/v1"

# ── control-plane flag without a credential errors ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
ERR="$("${CLI}" configure --control-plane-url http://localhost:13000 2>&1 >/dev/null)"
echo "${ERR}" | grep -Fq -- "--control-plane-url must be set together with a credential." || fail "endpoints: standalone --control-plane-url should error, got '${ERR}'"
pass "--control-plane-url without a credential is rejected"

# ── standalone data-plane URL is stored without a credential ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --data-plane-url http://localhost:15000 >/dev/null 2>&1
grep -q '^api_base=http://localhost:15000$' "${PROFILE_CONFIG}" || fail "endpoints: standalone --data-plane-url should store api_base"
pass "a standalone --data-plane-url is stored without a credential"

# ── omitting an endpoint resets it to the default (override model) ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u --password p --data-plane-url http://localhost:15000 >/dev/null 2>&1
"${CLI}" configure --user u --password p >/dev/null 2>&1
if grep -q '^api_base=' "${PROFILE_CONFIG}"; then fail "endpoints: a later configure without the flag should drop the stored endpoint"; fi
pass "omitting an endpoint resets it to the default"

# ── env var beats stored data-plane base ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u --password p --data-plane-url http://127.0.0.1:1111 >/dev/null 2>&1
setup_http_log
setup_mock_http "${QUERY_MOCK}"
ALTERTABLE_API_BASE=http://127.0.0.1:2222 "${CLI}" query --statement "SELECT 1" >/dev/null 2>&1
URL="$(http_log_url)"
teardown_mock_http
teardown_http_log
[[ "${URL}" == "http://127.0.0.1:2222/query" ]] || fail "endpoints: ALTERTABLE_API_BASE should beat stored api_base, got '${URL}'"
setup_http_log
setup_mock_http "${QUERY_MOCK}"
"${CLI}" query --statement "SELECT 1" >/dev/null 2>&1
URL="$(http_log_url)"
teardown_mock_http
teardown_http_log
[[ "${URL}" == "http://127.0.0.1:1111/query" ]] || fail "endpoints: stored api_base should be used when no env var, got '${URL}'"
pass "data-plane precedence: env var > stored config"

# ── --show displays both planes ──
rm -f "${CONFIG_FILE}" "${CRED_FILE}"
rm -rf "${TEST_HOME}/profiles"
"${CLI}" configure --user u --password p --data-plane-url http://localhost:15000 --control-plane-url http://localhost:13000 >/dev/null 2>&1
OUT="$("${CLI}" configure --show 2>/dev/null)"
echo "${OUT}" | grep -q 'Data plane:' || fail "--show: missing Data plane line"
echo "${OUT}" | grep -q 'Control plane:' || fail "--show: missing Control plane line"
echo "${OUT}" | grep -Fq 'http://localhost:15000' || fail "--show: should show the stored data-plane base"
echo "${OUT}" | grep -Fq 'http://localhost:13000/rest/v1' || fail "--show: should show the resolved control-plane base"
pass "--show displays both the data plane and the control plane"

echo ""
echo -e "${GREEN}All configure tests passed.${NC}"
