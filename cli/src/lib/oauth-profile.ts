import { configGet, configSet, configUnset } from "@/lib/config.ts";
import { secretDelete, secretGet, secretSet } from "@/lib/secrets.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { refreshAccessToken, type TokenResponse } from "@/lib/oauth-flow.ts";

const ACCESS_TOKEN_ACCOUNT = "oauth/access-token";
const REFRESH_TOKEN_ACCOUNT = "oauth/refresh-token";
const OAUTH_EXPIRY_KEY = "oauth_expiry";
const REFRESH_SKEW_MS = 60_000;

export function storeOAuthTokens(oauthResponse: TokenResponse): void {
  secretSet(ACCESS_TOKEN_ACCOUNT, oauthResponse.access_token);
  if (oauthResponse.refresh_token) {
    secretSet(REFRESH_TOKEN_ACCOUNT, oauthResponse.refresh_token);
  }
  const expiresInMs = (oauthResponse.expires_in ?? 0) * 1000;
  configSet(OAUTH_EXPIRY_KEY, String(Date.now() + expiresInMs));
}

export function getStoredAccessToken(): string {
  return secretGet(ACCESS_TOKEN_ACCOUNT);
}

export function clearOAuthTokens(): void {
  secretDelete(ACCESS_TOKEN_ACCOUNT);
  secretDelete(REFRESH_TOKEN_ACCOUNT);
  configUnset(OAUTH_EXPIRY_KEY);
}

export function hasOAuthSession(): boolean {
  return configGet(OAUTH_EXPIRY_KEY) !== "";
}

export async function ensureFreshAccessToken(): Promise<void> {
  if (process.env.ALTERTABLE_API_KEY) {
    return; // env API key takes precedence; don't refresh or clear the OAuth session
  }
  const expiryRaw = configGet(OAUTH_EXPIRY_KEY);
  if (!expiryRaw) {
    return; // not logged in via OAuth
  }
  const expiry = Number.parseInt(expiryRaw, 10);
  if (Number.isNaN(expiry) || Date.now() < expiry - REFRESH_SKEW_MS) {
    return; // still fresh
  }
  const refreshToken = secretGet(REFRESH_TOKEN_ACCOUNT);
  if (!refreshToken) {
    return; // nothing to refresh with; the expired token will 401
  }
  let oauthResponse: TokenResponse;
  try {
    oauthResponse = await refreshAccessToken(refreshToken);
  } catch {
    clearOAuthTokens();
    throw new ConfigurationError(
      "Your login session expired or was revoked. Run 'altertable login' to sign in again.",
    );
  }
  storeOAuthTokens(oauthResponse);
}
