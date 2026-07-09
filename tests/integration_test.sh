#!/bin/bash
set -euo pipefail

API_BASE="http://0.0.0.0:15000"

export ALTERTABLE_API_BASE="${API_BASE}"
export ALTERTABLE_LAKEHOUSE_USERNAME="testuser"
export ALTERTABLE_LAKEHOUSE_PASSWORD="testpass"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# ── upload (create) ───────────────────────────────────────────────────────────

printf 'id,name\n1,Alice\n2,Bob\n' > /tmp/at_test_upload.csv
"${CLI}" upload \
  --catalog memory --schema main --table cli_test \
  --mode overwrite --format csv \
  --file /tmp/at_test_upload.csv > /dev/null
rm /tmp/at_test_upload.csv
pass "upload creates table from CSV"

# ── upsert ───────────────────────────────────────────────────────────────────

printf 'id,name\n2,Bobby\n' > /tmp/at_test_upsert.csv
"${CLI}" upsert \
  --catalog memory --schema main --table cli_test \
  --primary-key id --format csv \
  --file /tmp/at_test_upsert.csv > /dev/null
rm /tmp/at_test_upsert.csv
pass "upsert updates table from CSV by primary key"

RESP=$("${CLI}" --json query "SELECT * FROM cli_test WHERE id = 2")
UPDATED=$(echo "${RESP}" | jq -r '.rows[0][1]')
[[ "${UPDATED}" == "Bobby" ]] || fail "upsert: expected row id=2 name 'Bobby', got '${UPDATED}'"
pass "query reflects upserted row"

# ── query ─────────────────────────────────────────────────────────────────────

RESP=$("${CLI}" query "SELECT * FROM cli_test ORDER BY id")
echo "${RESP}" | grep -q "id" || fail "query table: expected column header 'id'"
echo "${RESP}" | grep -q "Alice" || fail "query table: expected row value 'Alice'"
pass "query returns readable table output from uploaded table"

RESP=$("${CLI}" query "SELECT * FROM cli_test ORDER BY id" --format csv)
echo "${RESP}" | grep -q "id,name" || fail "query csv: expected CSV header"
echo "${RESP}" | grep -q "1,Alice" || fail "query csv: expected first data row"
pass "query --format csv returns CSV output"

RESP=$("${CLI}" --json query "SELECT * FROM cli_test ORDER BY id")
COLS=$(echo "${RESP}" | jq -r '.columns[0]')
[[ "${COLS}" == "id" ]] || fail "query --json: expected first column 'id', got '${COLS}'"
ROW1=$(echo "${RESP}" | jq -r '.rows[0][1]')
[[ "${ROW1}" == "Alice" ]] || fail "query --json: expected first row name 'Alice', got '${ROW1}'"
pass "query --json returns structured metadata, columns, and rows"

RESP=$("${CLI}" --agent query "SELECT * FROM cli_test ORDER BY id")
COLS=$(echo "${RESP}" | jq -r '.columns[0]')
[[ "${COLS}" == "id" ]] || fail "query --agent: expected first column 'id', got '${COLS}'"
pass "query --agent returns structured metadata, columns, and rows"

if "${CLI}" --agent query "SELECT 1" --layout table >/dev/null 2>&1; then
  fail "query --agent with --layout should fail"
fi
pass "query --agent rejects human-only --layout flag"

# ── management --agent (structured output contract) ──
export ALTERTABLE_API_KEY=atm_test
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Agent User\",\"email\":\"agent@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
RESP=$("${CLI}" --agent profile show 2>/dev/null)
teardown_mock_http
unset ALTERTABLE_API_KEY
[[ $(echo "${RESP}" | jq -r '.profile.user.email') == "agent@x.io" ]] || fail "profile show --agent: expected agent@x.io principal email"
pass "profile show --agent returns structured session JSON on integration mock"

# ── query with explicit query_id (used by query show / query cancel) ────────────

QID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
SID="b2c3d4e5-f6a7-8901-bcde-f12345678901"

"${CLI}" query "SELECT 42 AS answer" \
  --query-id "${QID}" --session-id "${SID}" > /dev/null
pass "query accepts --query-id and --session-id"

# ── query show ────────────────────────────────────────────────────────────────

RESP=$("${CLI}" query show "${QID}")
[[ $(echo "${RESP}" | jq -r '.uuid') == "${QID}" ]] || fail "query show: uuid mismatch"
[[ $(echo "${RESP}" | jq -r '.query') == "SELECT 42 AS answer" ]] || fail "query show: query text mismatch"
pass "query show returns the query log"

# ── query cancel ──────────────────────────────────────────────────────────────

QID2="c3d4e5f6-a7b8-9012-cdef-123456789012"
SID2="d4e5f6a7-b8c9-0123-defa-234567890123"

"${CLI}" query "SELECT 1" \
  --query-id "${QID2}" --session-id "${SID2}" > /dev/null

RESP=$("${CLI}" query cancel "${QID2}" --session-id "${SID2}")
[[ $(echo "${RESP}" | jq -r '.cancelled') == "true" ]] || fail "query cancel: expected cancelled=true"
pass "query cancel returns cancelled=true when session_id matches"

RESP=$("${CLI}" query cancel "${QID2}" --session-id "wrong-session")
[[ $(echo "${RESP}" | jq -r '.cancelled') == "false" ]] || fail "query cancel: expected cancelled=false for wrong session"
pass "query cancel returns cancelled=false for wrong session_id"

# ── append (single datum) ─────────────────────────────────────────────────────

setup_curl_spy

run_with_curl_capture "${CLI}" append \
  --catalog memory --schema main --table cli_test \
  --data '{"id": 3, "name": "Charlie"}'

assert_response_json_eq "append single: ok field" '.ok' 'true'
pass "append single: returns ok=true"

assert_curl_payload_eq \
  "append single: payload is raw JSON" '{"id": 3, "name": "Charlie"}'
pass "append single: payload is raw JSON"

RESP=$("${CLI}" --json query "SELECT COUNT(*) AS n FROM cli_test" 2>/dev/null)
COUNT=$(echo "${RESP}" | jq -r '.rows[0][0]')
[[ "${COUNT}" == "3" ]] || fail "append single: expected 3 rows after append, got '${COUNT}'"
pass "query reflects appended row (3 rows total)"

# ── append (batch) ────────────────────────────────────────────────────────────

run_with_curl_capture "${CLI}" append \
  --catalog memory --schema main --table cli_test \
  --data '[{"id": 4, "name": "Delta"}, {"id": 5, "name": "Echo"}]'

assert_response_json_eq "append batch: ok field" '.ok' 'true'
pass "append batch: returns ok=true"

assert_curl_payload_eq \
  "append batch: payload is raw JSON" '[{"id": 4, "name": "Delta"}, {"id": 5, "name": "Echo"}]'
pass "append batch: payload is raw JSON"

RESP=$("${CLI}" --json query "SELECT COUNT(*) AS n FROM cli_test" 2>/dev/null)
COUNT=$(echo "${RESP}" | jq -r '.rows[0][0]')
[[ "${COUNT}" == "5" ]] || fail "append batch: expected 5 rows after batch append, got '${COUNT}'"
pass "query reflects batch-appended rows (5 rows total)"

# ── append --sync ─────────────────────────────────────────────────────────────

run_with_curl_capture "${CLI}" append \
  --catalog memory --schema main --table cli_test \
  --data '{"id": 6, "name": "Foxtrot"}' \
  --sync

assert_response_json_eq "append sync: ok field" '.ok' 'true'
SYNC_URL="$(http_log_url)"
echo "${SYNC_URL}" | grep -q "sync=true" || fail "append --sync: expected sync=true in request URL, got '${SYNC_URL}'"
pass "append --sync sends sync=true"

teardown_curl_spy

# ── --debug flag ─────────────────────────────────────────────────────────────

STDERR=$("${CLI}" --debug query "SELECT 1" --format json 2>&1 >/dev/null)
echo "${STDERR}" | grep -q '\[DEBUG\]' || fail "--debug before command: expected [DEBUG] output on stderr"
echo "${STDERR}" | grep -q 'Request: POST' || fail "--debug before command: expected request debug output on stderr"
pass "--debug before command produces debug output"

STDERR=$("${CLI}" query --debug "SELECT 1" --format json 2>&1 >/dev/null)
echo "${STDERR}" | grep -q '\[DEBUG\]' || fail "--debug after command: expected [DEBUG] output on stderr"
echo "${STDERR}" | grep -q 'Request: POST' || fail "--debug after command: expected request debug output on stderr"
pass "--debug after command produces debug output"

echo ""
echo -e "${GREEN}All integration tests passed.${NC}"
