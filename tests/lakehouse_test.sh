#!/usr/bin/env bash
# Offline tests for high-level lakehouse command routing.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

TEST_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_SECRET_BACKEND=file
export ALTERTABLE_API_BASE="https://lakehouse.example.test"
export ALTERTABLE_LAKEHOUSE_USERNAME=testuser
export ALTERTABLE_LAKEHOUSE_PASSWORD=testpass
cleanup() { rm -rf "${TEST_HOME}"; teardown_http_log; teardown_mock_http; }
trap cleanup EXIT

APPEND_ID="11111111-2222-3333-4444-555555555555"

# ── append default leaf ──
setup_http_log
setup_mock_http "[
  {\"urlPattern\":\"/append\",\"method\":\"POST\",\"body\":\"{\\\"ok\\\":true,\\\"task_id\\\":\\\"${APPEND_ID}\\\"}\"}
]"
OUT="$("${CLI}" append --catalog memory --schema main --table users --data '{"id":1}' 2>/dev/null)"
teardown_mock_http
grep -q '^METHOD=POST$' "${HTTP_LOG}" || fail "append default: expected POST"
grep -q '^URL=https://lakehouse.example.test/append?' "${HTTP_LOG}" || fail "append default: wrong URL: $(grep '^URL=' "${HTTP_LOG}")"
echo "${OUT}" | jq -e '.ok == true and .task_id == "'"${APPEND_ID}"'"' >/dev/null \
  || fail "append default: expected ok response with append id, got '${OUT}'"
teardown_http_log
pass "append defaults to the run command"

# ── append status subcommand ──
setup_http_log
setup_mock_http "[
  {\"urlPattern\":\"/tasks/${APPEND_ID}\",\"method\":\"GET\",\"body\":\"{\\\"task_id\\\":\\\"${APPEND_ID}\\\",\\\"status\\\":\\\"completed\\\"}\"}
]"
OUT="$("${CLI}" append status "${APPEND_ID}" 2>/dev/null)"
teardown_mock_http
grep -q '^METHOD=GET$' "${HTTP_LOG}" || fail "append status: expected GET"
grep -q "^URL=https://lakehouse.example.test/tasks/${APPEND_ID}$" "${HTTP_LOG}" \
  || fail "append status: wrong URL: $(grep '^URL=' "${HTTP_LOG}")"
echo "${OUT}" | jq -e '.task_id == "'"${APPEND_ID}"'" and .status == "completed"' >/dev/null \
  || fail "append status: expected completed append response, got '${OUT}'"
teardown_http_log
pass "append status fetches status without append-run flags"

echo ""
echo -e "${GREEN}All lakehouse tests passed.${NC}"
