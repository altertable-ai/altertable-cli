#!/usr/bin/env bash
# Offline tests for org and environment switching.
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
ORG_LIST_MOCK='[
  {"urlPattern":"/graphql","method":"POST","body":"{\"data\":{\"currentUser\":{\"organizations\":{\"nodes\":[{\"id\":\"org_acme\",\"name\":\"Acme\",\"slug\":\"acme\",\"currentPlan\":{\"id\":\"plan_trial\",\"name\":\"Trial\"},\"environments\":{\"nodes\":[{\"id\":\"env_prod\",\"name\":\"Production\",\"slug\":\"production\"}]}}]}}}}"},
  {"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane\",\"email\":\"j@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"}
]'
ORG_SHOW_MOCK='[
  {"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane\",\"email\":\"j@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"},
  {"urlPattern":"/graphql","method":"POST","body":"{\"data\":{\"currentUser\":{\"organizations\":{\"nodes\":[{\"id\":\"org_acme\",\"name\":\"Acme\",\"slug\":\"acme\",\"currentPlan\":{\"id\":\"plan_trial\",\"name\":\"Trial\"},\"environments\":{\"nodes\":[{\"id\":\"env_prod\",\"name\":\"Production\",\"slug\":\"production\"}]}}]}},\"organization\":{\"id\":\"org_acme\",\"name\":\"Acme\",\"slug\":\"acme\",\"lakehouseUser\":\"u_acme\",\"duckdbVersion\":\"v1.2.0\",\"altertableVersion\":\"v1.0.0\",\"createdAt\":\"2026-01-01T00:00:00Z\",\"currentPlan\":{\"id\":\"plan_trial\",\"name\":\"Trial\"},\"environments\":{\"nodes\":[{\"id\":\"env_prod\",\"name\":\"Production\",\"slug\":\"production\",\"cloudProvider\":\"HETZNER\",\"cloudProviderAwsRegion\":null,\"cloudProviderHetznerRegion\":\"FSN1\"}]}}}}"}
]'
ENV_LIST_MOCK='[
  {"urlPattern":"/whoami","method":"GET","body":"{\"principal\":{\"type\":\"User\",\"name\":\"Jane\",\"email\":\"j@x.io\"},\"organization\":{\"name\":\"Acme\",\"slug\":\"acme\"}}"},
  {"urlPattern":"/graphql","method":"POST","body":"{\"data\":{\"currentUser\":{\"organizations\":{\"nodes\":[{\"id\":\"org_acme\",\"name\":\"Acme\",\"slug\":\"acme\"}]}},\"organization\":{\"id\":\"org_acme\",\"name\":\"Acme\",\"slug\":\"acme\",\"environments\":{\"nodes\":[{\"id\":\"env_prod\",\"name\":\"Production\",\"slug\":\"production\",\"cloudProvider\":\"HETZNER\",\"cloudProviderAwsRegion\":null,\"cloudProviderHetznerRegion\":\"FSN1\"},{\"id\":\"env_dev\",\"name\":\"Dev\",\"slug\":\"dev\",\"cloudProvider\":\"AWS\",\"cloudProviderAwsRegion\":\"EU_WEST_1\",\"cloudProviderHetznerRegion\":null}]}}}}"}
]'

"${CLI}" configure --org staging --api-key atm_staging --env staging >/dev/null 2>&1
"${CLI}" configure --org production --api-key atm_prod --env production >/dev/null 2>&1
"${CLI}" org use production >/dev/null 2>&1
pass "configure creates staging and production orgs"

setup_mock_http "${ORG_LIST_MOCK}"
OUT="$("${CLI}" org list 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -q 'Acme' || fail "org list should include Acme"
echo "${OUT}" | grep -q 'Trial' || fail "org list should include plan"
echo "${OUT}" | grep -vq '^default' || fail "org list should not show local default org"
pass "org list shows organizations from the API"

setup_mock_http "${ORG_SHOW_MOCK}"
OUT="$("${CLI}" org show 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -q 'Organization:' || fail "org show should render organization entity"
echo "${OUT}" | grep -q 'Acme (acme)' || fail "org show should include API organization name"
pass "org show uses the API organization entity"

"${CLI}" org use staging >/dev/null 2>&1
setup_mock_http "${WHOAMI_STAGING}"
OUT="$("${CLI}" context 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Staging' || fail "org use staging: expected Staging user, got '${OUT}'"
pass "org use staging switches context identity"

setup_mock_http '[{"urlPattern":"/environments/production","method":"GET","body":"{\"environment\":{\"id\":\"env_1\",\"name\":\"Production\",\"slug\":\"production\",\"cloud_provider\":\"hetzner\",\"cloud_provider_region\":\"fsn1\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}}"}]'
"${CLI}" env use production >/dev/null 2>&1
teardown_mock_http
setup_mock_http '[{"urlPattern":"/environments/production","method":"GET","body":"{\"environment\":{\"id\":\"env_1\",\"name\":\"Production\",\"slug\":\"production\",\"cloud_provider\":\"hetzner\",\"cloud_provider_region\":\"fsn1\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}}"}]'
OUT="$("${CLI}" env show 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'production' || fail "env show should include production, got '${OUT}'"
pass "env use switches active environment"

setup_mock_http "${ENV_LIST_MOCK}"
OUT="$("${CLI}" env list 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Production' || fail "env list should include Production, got '${OUT}'"
echo "${OUT}" | grep -Fq 'Dev' || fail "env list should include Dev, got '${OUT}'"
pass "env list shows environments from the API"

setup_mock_http "${WHOAMI_PROD}"
OUT="$("${CLI}" --org production context 2>/dev/null)"
teardown_mock_http
echo "${OUT}" | grep -Fq 'Production' || fail "--org production: expected Production user, got '${OUT}'"
pass "--org flag overrides active org for one command"

echo ""
echo -e "${GREEN}All org tests passed.${NC}"
