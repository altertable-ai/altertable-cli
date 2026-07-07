#!/usr/bin/env bash
# Offline tests for profile switching.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

TEST_HOME="$(mktemp -d)"
export ALTERTABLE_CONFIG_HOME="${TEST_HOME}"
export ALTERTABLE_SECRET_BACKEND=file
unset ALTERTABLE_API_KEY ALTERTABLE_ENV 2>/dev/null || true
cleanup() { rm -rf "${TEST_HOME}"; teardown_mock_http; }
trap cleanup EXIT

WHOAMI_STAGING='[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Staging\",\"email\":\"s@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'
WHOAMI_PROD='[{"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Production\",\"email\":\"p@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}]'

"${CLI}" configure --org acme --api-key atm_staging --env staging >/dev/null 2>&1
"${CLI}" configure --org acme --api-key atm_prod --env production >/dev/null 2>&1
pass "configure creates org_env profiles"

OUT="$("${CLI}" profile list 2>/dev/null)"
echo "${OUT}" | grep -q 'acme_staging' || fail "profile list should include acme_staging"
echo "${OUT}" | grep -q 'acme_production' || fail "profile list should include acme_production"
echo "${OUT}" | grep -q 'acme' || fail "profile list should include organization"
pass "profile list shows configured profiles"

"${CLI}" profile switch acme_staging >/dev/null 2>&1
OUT="$("${CLI}" profile current 2>/dev/null)"
echo "${OUT}" | grep -Fxq 'acme_staging' || fail "profile current should show acme_staging"
pass "profile switch and current update active profile"

setup_mock_http "${WHOAMI_STAGING}"
OUT="$("${CLI}" context 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Staging' || fail "profile use staging: expected Staging user, got '${OUT}'"
pass "profile switch acme_staging switches context identity"

setup_mock_http "${WHOAMI_PROD}"
OUT="$("${CLI}" --profile acme_production context 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Production' || fail "--profile production: expected Production user, got '${OUT}'"
pass "--profile flag overrides active profile for one command"

"${CLI}" profile rename acme_staging acme_stage >/dev/null 2>&1
OUT="$("${CLI}" profile current 2>/dev/null)"
echo "${OUT}" | grep -Fxq 'acme_stage' || fail "profile rename should carry active profile"
pass "profile rename moves the active profile"

echo ""
echo -e "${GREEN}All profile tests passed.${NC}"
