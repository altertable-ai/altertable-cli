import { configGet, configSet, resolveOAuthBase } from "@/lib/config.ts";
import { secretDelete, secretGet, secretSet } from "@/lib/secrets.ts";
import { ConfigurationError, HttpError } from "@/lib/errors.ts";
import { refreshAccessToken, type TokenResponse } from "@/lib/oauth-flow.ts";
import { readEnv } from "@/lib/env.ts";

const ACCESS_TOKEN_ACCOUNT = "oauth/access-token";
const REFRESH_TOKEN_ACCOUNT = "oauth/refresh-token";
const OAUTH_EXPIRY_KEY = "oauth_expiry";
const REFRESH_SKEW_MS = 60_000;

export function storeOAuthTokens(oauthResponse: TokenResponse, profileName: string): void {
  secretSet(ACCESS_TOKEN_ACCOUNT, oauthResponse.access_token, profileName);
  if (oauthResponse.refresh_token) {
    secretSet(REFRESH_TOKEN_ACCOUNT, oauthResponse.refresh_token, profileName);
  }
  const expiresInMs = (oauthResponse.expires_in ?? 0) * 1000;
  configSet(OAUTH_EXPIRY_KEY, String(Date.now() + expiresInMs), profileName);
}

export function getStoredAccessToken(profileName: string): string {
  return secretGet(ACCESS_TOKEN_ACCOUNT, profileName);
}

export function clearOAuthTokens(profileName: string): void {
  secretDelete(ACCESS_TOKEN_ACCOUNT, profileName);
  secretDelete(REFRESH_TOKEN_ACCOUNT, profileName);
  configSet(OAUTH_EXPIRY_KEY, "", profileName);
}

export function hasOAuthSession(profileName: string): boolean {
  return configGet(OAUTH_EXPIRY_KEY, profileName) !== "";
}

export async function ensureFreshAccessToken(profileName: string): Promise<void> {
  if (readEnv("ALTERTABLE_API_KEY")) {
    return; // env API key takes precedence; don't refresh or clear the OAuth session
  }
  const expiryRaw = configGet(OAUTH_EXPIRY_KEY, profileName);
  if (!expiryRaw) {
    return; // not logged in via OAuth
  }
  const expiry = Number.parseInt(expiryRaw, 10);
  if (Number.isNaN(expiry) || Date.now() < expiry - REFRESH_SKEW_MS) {
    return; // still fresh
  }
  const refreshToken = secretGet(REFRESH_TOKEN_ACCOUNT, profileName);
  if (!refreshToken) {
    return; // nothing to refresh with; the expired token will 401
  }
  let oauthResponse: TokenResponse;
  try {
    oauthResponse = await refreshAccessToken(refreshToken, resolveOAuthBase(profileName));
  } catch (error) {
    // Only a rejected grant means the session is gone: the token endpoint returns
    // 400 (invalid_grant — expired/revoked refresh token, RFC 6749 §5.2) or 401
    // (invalid_client). Anything else — 403 (gateway/WAF block or suspended
    // account), 404 (wrong control-plane URL), 429 (rate limited), 5xx,
    // network/timeout — keeps the tokens and surfaces as-is so we don't wipe a
    // valid session and print a misleading "expired" message.
    if (error instanceof HttpError && (error.status === 400 || error.status === 401)) {
      clearOAuthTokens(profileName);
      throw new ConfigurationError(
        "Your login session expired or was revoked. Run 'altertable login' to sign in again.",
      );
    }
    throw error;
  }
  storeOAuthTokens(oauthResponse, profileName);
}
