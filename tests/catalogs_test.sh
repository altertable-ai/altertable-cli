#!/usr/bin/env bash
# Offline tests for `altertable catalogs` (create + list).
set -o pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

TEST_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_SECRET_BACKEND=file
export ALTERTABLE_API_KEY=atm_test
export ALTERTABLE_ENV=production
unset ALTERTABLE_MANAGEMENT_API_BASE 2>/dev/null || true
cleanup() { rm -rf "${TEST_HOME}"; teardown_http_log; teardown_mock_http; }
trap cleanup EXIT

CATALOGS_MOCK='[
  {"urlPattern":"/environments/production/databases","method":"POST","body":"{\"database\":{\"name\":\"My Cat\",\"slug\":\"my-cat\",\"engine\":\"altertable\",\"catalog\":\"my_cat\"}}"},
  {"urlPattern":"/environments/production/databases","method":"GET","body":"{\"databases\":[{\"name\":\"My Cat\",\"slug\":\"my-cat\",\"engine\":\"altertable\",\"catalog\":\"my_cat\"}]}"},
  {"urlPattern":"/environments/production/connections","method":"GET","body":"{\"connections\":[{\"name\":\"Prod PG\",\"slug\":\"prod-pg\",\"engine\":\"postgres\",\"catalog\":\"prod_pg\"}]}"}
]'

# ── create: engine validation ──
ERR="$("${CLI}" catalogs create --engine postgres --name "X" 2>&1 >/dev/null)"
echo "${ERR}" | grep -Fq "Expected one of: altertable" || fail "create: expected engine rejection, got '${ERR}'"
pass "catalogs create rejects non-altertable engines"

# ── create: request shape ──
setup_http_log
setup_mock_http "${CATALOGS_MOCK}"
OUT="$("${CLI}" catalogs create --engine altertable --name "My Cat" 2>/dev/null)"
grep -q '^METHOD=POST$' "${HTTP_LOG}" || fail "create: expected POST"
grep -q '^URL=https://app.altertable.ai/rest/v1/environments/production/databases$' "${HTTP_LOG}" || fail "create: wrong URL: $(grep '^URL=' "${HTTP_LOG}")"
grep -qF 'AUTH=Authorization: [REDACTED]' "${HTTP_LOG}" || fail "create: wrong auth"
assert_http_log_has_no_secrets "create: wrong auth" "atm_test"
PAYLOAD="$(grep '^PAYLOAD=' "${HTTP_LOG}" | sed 's/^PAYLOAD=//')"
[[ "$(printf '%s' "$PAYLOAD" | jq -cS '.')" == '{"engine":"altertable","name":"My Cat"}' ]] || fail "create: wrong payload: '${PAYLOAD}'"
teardown_mock_http
teardown_http_log
echo "${OUT}" | grep -Fq 'Created catalog "My Cat"' || fail "create: missing confirmation: '${OUT}'"
pass "catalogs create posts to /databases with the right payload and confirms"

# ── create: requires an environment ──
ERR="$(ALTERTABLE_ENV='' "${CLI}" catalogs create --engine altertable --name "X" 2>&1 >/dev/null)"
echo "${ERR}" | grep -Fq "No environment set" || fail "create: expected env-required error, got '${ERR}'"
pass "catalogs create requires an environment"

# ── list: calls databases then connections, databases first in the table ──
setup_http_log
setup_mock_http "${CATALOGS_MOCK}"
OUT="$("${CLI}" catalogs list 2>/dev/null)"
DB_URL_LINE="$(grep -n '^URL=.*/databases$' "${HTTP_LOG}" | head -1 | cut -d: -f1)"
CONN_URL_LINE="$(grep -n '^URL=.*/connections$' "${HTTP_LOG}" | head -1 | cut -d: -f1)"
teardown_mock_http
teardown_http_log
[[ -n "$DB_URL_LINE" && -n "$CONN_URL_LINE" ]] || fail "list: expected both /databases and /connections calls"
[[ "$DB_URL_LINE" -lt "$CONN_URL_LINE" ]] || fail "list: /databases must be called before /connections"
echo "${OUT}" | grep -Eq 'SLUG[[:space:]]+NAME[[:space:]]+ENGINE[[:space:]]+CATALOG[[:space:]]+TYPE' || fail "list: missing header: '${OUT}'"
DB_OUT_LINE="$(echo "${OUT}" | grep -nE '^my-cat[[:space:]]' | head -1 | cut -d: -f1)"
CONN_OUT_LINE="$(echo "${OUT}" | grep -nE '^prod-pg[[:space:]]' | head -1 | cut -d: -f1)"
[[ -n "$DB_OUT_LINE" && -n "$CONN_OUT_LINE" && "$DB_OUT_LINE" -lt "$CONN_OUT_LINE" ]] || fail "list: databases must render before connections: '${OUT}'"
pass "catalogs list shows databases before connections in a table"

# ── list: --agent returns structured JSON envelope ──
setup_mock_http "${CATALOGS_MOCK}"
OUT="$("${CLI}" --agent catalogs list 2>/dev/null)"
teardown_mock_http
CATALOG_COUNT=$(echo "${OUT}" | jq -r '.catalogs | length')
[[ "${CATALOG_COUNT}" == "2" ]] || fail "catalogs list --agent: expected 2 catalogs, got '${CATALOG_COUNT}'"
pass "catalogs list --agent returns structured catalogs envelope"

# ── list: databases always render the hardcoded "altertable" engine ──
setup_mock_http '[
  {"urlPattern":"/environments/production/databases","method":"GET","body":"{\"databases\":[{\"name\":\"My Cat\",\"slug\":\"my-cat\",\"engine\":\"postgres\",\"catalog\":\"my_cat\"}]}"},
  {"urlPattern":"/environments/production/connections","method":"GET","body":"{\"connections\":[{\"name\":\"Prod PG\",\"slug\":\"prod-pg\",\"engine\":\"postgres\",\"catalog\":\"prod_pg\"}]}"}
]'
OUT="$("${CLI}" catalogs list 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -E '^my-cat[[:space:]]' | grep -q 'altertable' || fail "list: database engine must be hardcoded altertable: '${OUT}'"
echo "${OUT}" | grep -E '^prod-pg[[:space:]]' | grep -q 'postgres' || fail "list: connection engine must be preserved: '${OUT}'"
pass "catalogs list always shows the altertable engine for databases"

# ── list: a non-2xx (e.g. 404 from /databases) hard-fails ──
setup_mock_http '[{"urlPattern":"/environments/production/databases","method":"GET","status":404,"body":"{\"error\":{\"code\":\"not_found\"}}"}]'
if "${CLI}" catalogs list >/dev/null 2>&1; then teardown_mock_http; fail "list: a 404 must hard-fail"; fi
teardown_mock_http
pass "catalogs list hard-fails on a non-2xx response"

echo ""
echo -e "${GREEN}All catalogs tests passed.${NC}"
