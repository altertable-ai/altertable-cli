export const PROFILE_CONFIG_KEYS = [
  "user",
  "api_key_env",
  "api_base",
  "management_api_base",
  "organization_slug",
  "organization_name",
  "principal_type",
  "principal_name",
  "principal_email",
  "principal_slug",
  "description",
  "created_at",
  "updated_at",
  "last_verified_at",
  "oauth_expiry",
  "lakehouse_credential_expiry",
] as const;

export type ProfileConfigKey = (typeof PROFILE_CONFIG_KEYS)[number];

const PROFILE_SCOPED_KEYS = new Set<string>(PROFILE_CONFIG_KEYS);

export function isProfileScopedConfigKey(key: string): key is ProfileConfigKey {
  return PROFILE_SCOPED_KEYS.has(key);
}
