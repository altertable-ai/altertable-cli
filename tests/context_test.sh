#!/usr/bin/env bash
# Offline tests for `altertable context` output formatting.
set -o pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

TEST_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_SECRET_BACKEND=file
export ALTERTABLE_API_KEY=atm_test
unset ALTERTABLE_ENV ALTERTABLE_MANAGEMENT_API_BASE 2>/dev/null || true
cleanup() { rm -rf "${TEST_HOME}"; teardown_mock_http; }
trap cleanup EXIT

# ── User principal ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane Doe\",\"email\":\"jane@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" context 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Profile:' || fail "context profile line missing: '${OUT}'"
echo "${OUT}" | grep -Fq 'User:' || fail "context user line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'Jane Doe <jane@x.io>' || fail "context user line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'Organization:' || fail "context org line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'Acme (acme)' || fail "context org line wrong: '${OUT}'"
pass "context formats a User principal"

# ── --no-color strips ANSI styling ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane Doe\",\"email\":\"jane@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" --no-color context 2>/dev/null)"
teardown_mock_http
if echo "${OUT}" | grep -Eq $'\033'; then
  fail "context --no-color: output contains ANSI escape sequences"
fi
echo "${OUT}" | grep -Fq 'Jane Doe <jane@x.io>' || fail "context --no-color: expected plain user line"
pass "context --no-color emits plain text without ANSI"

# ── --agent JSON output ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane Doe\",\"email\":\"jane@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" --agent context 2>/dev/null)"
teardown_mock_http
PRINCIPAL=$(echo "${OUT}" | jq -r '.principal.name')
PROFILE=$(echo "${OUT}" | jq -r '.profile')
[[ "${PRINCIPAL}" == "Jane Doe" ]] || fail "context --agent: expected principal.name 'Jane Doe', got '${PRINCIPAL}'"
[[ "${PROFILE}" == "default" ]] || fail "context --agent: expected profile 'default', got '${PROFILE}'"
pass "context --agent returns structured session JSON"

# ── ServiceAccount principal ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"ServiceAccount\",\"name\":\"ci-bot\",\"slug\":\"ci-bot\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" context 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Service account:' || fail "context service-account line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'ci-bot (ci-bot)' || fail "context service-account line wrong: '${OUT}'"
pass "context formats a ServiceAccount principal"

echo ""
echo -e "${GREEN}All context tests passed.${NC}"
