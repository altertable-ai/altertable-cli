import { CliError } from "@/lib/errors.ts";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

function isLocalhostHttp(url: URL): boolean {
  return url.protocol === "http:" && LOCALHOST_HOSTS.has(url.hostname);
}

export function assertAllowedApiBase(url: string, options?: { allowInsecureHttp?: boolean }): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CliError(`Invalid URL: ${url}`);
  }

  if (parsed.protocol === "https:") {
    return;
  }

  if (parsed.protocol === "http:") {
    if (isLocalhostHttp(parsed)) {
      return;
    }
    if (options?.allowInsecureHttp) {
      return;
    }
    throw new CliError(
      `Insecure HTTP URL is only allowed for localhost. Use https:// or pass --allow-insecure-http (not recommended).`,
    );
  }

  throw new CliError(`Unsupported URL scheme: ${parsed.protocol} (use http:// or https://)`);
}
