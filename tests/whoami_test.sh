#!/usr/bin/env bash
# Offline tests for `altertable whoami` output formatting.
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
OUT="$("${CLI}" whoami 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'User: Jane Doe <jane@x.io>' || fail "whoami user line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'Organization: Acme (acme)' || fail "whoami org line wrong: '${OUT}'"
pass "whoami formats a User principal"

# ── ServiceAccount principal ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"ServiceAccount\",\"name\":\"ci-bot\",\"slug\":\"ci-bot\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" whoami 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Service account: ci-bot (ci-bot)' || fail "whoami service-account line wrong: '${OUT}'"
pass "whoami formats a ServiceAccount principal"

echo ""
echo -e "${GREEN}All whoami tests passed.${NC}"
