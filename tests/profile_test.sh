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

"${CLI}" configure --profile staging --api-key atm_staging --env staging >/dev/null 2>&1
"${CLI}" configure --profile production --api-key atm_prod --env production >/dev/null 2>&1
pass "configure creates staging and production profiles"

OUT="$("${CLI}" profile list 2>/dev/null)"
echo "${OUT}" | grep -q 'staging' || fail "profile list should include staging"
echo "${OUT}" | grep -q 'production' || fail "profile list should include production"
pass "profile list shows configured profiles"

"${CLI}" profile use staging >/dev/null 2>&1
setup_mock_http "${WHOAMI_STAGING}"
OUT="$("${CLI}" whoami 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Staging' || fail "profile use staging: expected Staging user, got '${OUT}'"
pass "profile use staging switches whoami identity"

setup_mock_http "${WHOAMI_PROD}"
OUT="$("${CLI}" --profile production whoami 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Production' || fail "--profile production: expected Production user, got '${OUT}'"
pass "--profile flag overrides active profile for one command"

echo ""
echo -e "${GREEN}All profile tests passed.${NC}"
