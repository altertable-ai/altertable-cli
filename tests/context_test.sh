#!/usr/bin/env bash
# Offline tests for `altertable profile show` output formatting (identity section).
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
OUT="$("${CLI}" profile show 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Profile:' || fail "profile show profile line missing: '${OUT}'"
echo "${OUT}" | grep -Fq 'User:' || fail "profile show user line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'Jane Doe <jane@x.io>' || fail "profile show user line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'Organization:' || fail "profile show org line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'Acme (acme)' || fail "profile show org line wrong: '${OUT}'"
if echo "${OUT}" | grep -Fq 'Config dir:'; then
  fail "profile show should not print CLI config by default: '${OUT}'"
fi
pass "profile show formats a User principal"

# ── --config includes CLI config paths ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane Doe\",\"email\":\"jane@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" profile show --config 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Config dir:' || fail "profile show --config: expected Config dir line: '${OUT}'"
echo "${OUT}" | grep -Fq 'Profile config file:' || fail "profile show --config: expected profile config file line: '${OUT}'"
echo "${OUT}" | grep -Fq 'Secret store:' || fail "profile show --config: expected Secret store line: '${OUT}'"
pass "profile show --config includes CLI config paths"

# ── --no-color strips ANSI styling ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane Doe\",\"email\":\"jane@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" --no-color profile show 2>/dev/null)"
teardown_mock_http
if echo "${OUT}" | grep -Eq $'\033'; then
  fail "profile show --no-color: output contains ANSI escape sequences"
fi
echo "${OUT}" | grep -Fq 'Jane Doe <jane@x.io>' || fail "profile show --no-color: expected plain user line"
pass "profile show --no-color emits plain text without ANSI"

# ── --agent JSON output ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane Doe\",\"email\":\"jane@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" --agent profile show 2>/dev/null)"
teardown_mock_http
PRINCIPAL=$(echo "${OUT}" | jq -r '.profile.user.name')
PROFILE=$(echo "${OUT}" | jq -r '.profile.name')
[[ "${PRINCIPAL}" == "Jane Doe" ]] || fail "profile show --agent: expected profile.user.name 'Jane Doe', got '${PRINCIPAL}'"
[[ "${PROFILE}" == "default" ]] || fail "profile show --agent: expected profile.name 'default', got '${PROFILE}'"
pass "profile show --agent returns structured JSON"

# ── ServiceAccount principal ──
setup_mock_http '[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"ServiceAccount\",\"name\":\"ci-bot\",\"slug\":\"ci-bot\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
OUT="$("${CLI}" profile show 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Service account:' || fail "profile show service-account line wrong: '${OUT}'"
echo "${OUT}" | grep -Fq 'ci-bot (ci-bot)' || fail "profile show service-account line wrong: '${OUT}'"
pass "profile show formats a ServiceAccount principal"

echo ""
echo -e "${GREEN}All profile show tests passed.${NC}"
