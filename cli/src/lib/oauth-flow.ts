import * as oauth from "oauth4webapi";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { httpSend } from "@/lib/http.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { terminalMetadata } from "@/ui/terminal/styles.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { readEnv } from "@/lib/env.ts";

const LOGIN_TIMEOUT_MS = 180_000;

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

export function oauthClientId(): string {
  return readEnv("oauthClientId") ?? "altertable_cli";
}

export function oauthScope(): string {
  return readEnv("oauthScope") ?? "management";
}

export type CallbackOutcome = { ok: true; code: string } | { ok: false; message: string };

export function parseCallback(requestUrl: string, expectedState: string): CallbackOutcome {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description");
    return {
      ok: false,
      message: `Authorization failed: ${error}${description ? ` — ${description}` : ""}`,
    };
  }
  if (url.searchParams.get("state") !== expectedState) {
    return { ok: false, message: "OAuth state mismatch — possible CSRF. Aborting." };
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return { ok: false, message: "Authorization response was missing the code parameter." };
  }
  return { ok: true, code };
}

export function buildAuthorizeUrl(
  params: {
    redirectUri: string;
    challenge: string;
    state: string;
  },
  oauthBase: string,
): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: oauthClientId(),
    redirect_uri: params.redirectUri,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    state: params.state,
  });
  const scope = oauthScope();
  if (scope) {
    query.set("scope", scope);
  }
  return `${oauthBase}/authorize?${query.toString()}`;
}

type OAuthFetchOptions = oauth.CustomFetchOptions<"POST", URLSearchParams>;

function resolveAuthServer(oauthBase: string): oauth.AuthorizationServer {
  return {
    // Discovery advertises the issuer as the server root (base without the /oauth suffix).
    issuer: oauthBase.replace(/\/oauth$/, ""),
    authorization_endpoint: `${oauthBase}/authorize`,
    token_endpoint: `${oauthBase}/token`,
  };
}

function resolveOauthClient(): oauth.Client {
  return { client_id: oauthClientId() };
}

// Route oauth4webapi's token requests through httpSend so the credential path keeps
// our secret redaction in debug logs, retry policy, and assertAllowedApiBase URL policy.
async function httpSendFetch(url: string, options: OAuthFetchOptions): Promise<Response> {
  const headers = new Headers(options.headers);
  const accept = headers.get("accept");
  const body = await httpSend({
    method: options.method,
    url,
    authHeader: headers.get("authorization") ?? "",
    body: options.body.toString(),
    contentType: headers.get("content-type") ?? "application/x-www-form-urlencoded",
    extraHeaders: accept ? { accept } : undefined,
    authPlane: "management",
    maxAttempts: 1,
  });
  // httpSend already threw on any non-2xx, so this is a success body.
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function tokenRequestOptions(oauthBase: string): oauth.TokenEndpointRequestOptions {
  const options: oauth.TokenEndpointRequestOptions = { [oauth.customFetch]: httpSendFetch };
  if (oauthBase.startsWith("http://")) {
    // Endpoint protocol is gated by our own url-policy; let oauth4webapi allow the
    // http:// loopback/localhost control-plane instead of hard-failing on it.
    options[oauth.allowInsecureRequests] = true;
  }
  return options;
}

function toTokenResponse(result: oauth.TokenEndpointResponse): TokenResponse {
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_in: result.expires_in,
    token_type: result.token_type,
  };
}

export async function exchangeCode(
  params: {
    code: string;
    redirectUri: string;
    verifier: string;
  },
  oauthBase: string,
): Promise<TokenResponse> {
  const authServer = resolveAuthServer(oauthBase);
  const client = resolveOauthClient();
  // parseCallback already verified `state` against the loopback's expected value, so
  // skip the re-check here; validateAuthResponse still brands the params object that
  // authorizationCodeGrantRequest requires (and rejects an unexpected error response).
  const callbackParameters = oauth.validateAuthResponse(
    authServer,
    client,
    new URLSearchParams({ code: params.code }),
    oauth.skipStateCheck,
  );
  const response = await oauth.authorizationCodeGrantRequest(
    authServer,
    client,
    oauth.None(),
    callbackParameters,
    params.redirectUri,
    params.verifier,
    tokenRequestOptions(oauthBase),
  );
  return toTokenResponse(
    await oauth.processAuthorizationCodeResponse(authServer, client, response),
  );
}

export async function refreshAccessToken(
  refreshToken: string,
  oauthBase: string,
): Promise<TokenResponse> {
  const authServer = resolveAuthServer(oauthBase);
  const client = resolveOauthClient();
  const response = await oauth.refreshTokenGrantRequest(
    authServer,
    client,
    oauth.None(),
    refreshToken,
    tokenRequestOptions(oauthBase),
  );
  return toTokenResponse(await oauth.processRefreshTokenResponse(authServer, client, response));
}

function redirectPort(): number {
  return readEnv("oauthRedirectPort") ?? 0;
}

export type LoopbackServer = {
  redirectUri: string;
  waitForCode: () => Promise<string>;
  close: () => void;
};

export function startLoopbackServer(expectedState: string): Promise<LoopbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCode: (code: string) => void = () => {};
    let rejectCode: (error: Error) => void = () => {};
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const outcome = parseCallback(req.url ?? "", expectedState);
      // Plain text: the message can echo provider-supplied error_description, so
      // never serve it as HTML (would reflect untrusted input into the page).
      res.writeHead(outcome.ok ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        outcome.ok
          ? "Signed in. You can close this tab and return to the terminal."
          : outcome.message,
      );
      if (outcome.ok) {
        resolveCode(outcome.code);
      } else {
        rejectCode(new ConfigurationError(outcome.message));
      }
    });

    server.on("error", rejectServer);
    server.listen(redirectPort(), "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const timer = setTimeout(() => {
        rejectCode(new ConfigurationError("Timed out waiting for browser sign-in (3 minutes)."));
      }, LOGIN_TIMEOUT_MS);
      resolveServer({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        waitForCode: () => codePromise.finally(() => clearTimeout(timer)),
        close: () => {
          clearTimeout(timer);
          server.close();
        },
      });
    });
  });
}

export function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // the printed URL is the fallback
    child.unref();
  } catch {
    // ignore — the authorize URL was printed for manual use
  }
}

export async function runLoginFlow(sink: OutputSink, oauthBase: string): Promise<TokenResponse> {
  const verifier = oauth.generateRandomCodeVerifier();
  const challenge = await oauth.calculatePKCECodeChallenge(verifier);
  const state = oauth.generateRandomState();
  const server = await startLoopbackServer(state);
  try {
    const authorizeUrl = buildAuthorizeUrl(
      { redirectUri: server.redirectUri, challenge, state },
      oauthBase,
    );
    sink.writeMetadata([terminalMetadata("Opening your browser to sign in…")]);
    sink.writeMetadata([terminalMetadata(`If it doesn't open, visit: ${authorizeUrl}`)]);
    openBrowser(authorizeUrl);
    const code = await server.waitForCode();
    return await exchangeCode({ code, redirectUri: server.redirectUri, verifier }, oauthBase);
  } finally {
    server.close();
  }
}
