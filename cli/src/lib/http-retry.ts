import { sleep } from "@/lib/sleep.ts";

export const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export function isRetryableMethod(method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "DELETE";
}

export function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const trimmed = headerValue.trim();
  const seconds = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(seconds)) {
    return seconds * 1_000;
  }

  const retryDate = Date.parse(trimmed);
  if (!Number.isNaN(retryDate)) {
    const delayMs = retryDate - Date.now();
    return delayMs > 0 ? delayMs : undefined;
  }

  return undefined;
}

export function computeRetryDelayMs(attemptIndex: number, retryAfterHeader: string | null): number {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  return RETRY_BASE_DELAY_MS * 2 ** attemptIndex;
}

export type HttpRetryOptions = {
  method: string;
  retry?: boolean;
};

export function shouldRetryHttpRequest(
  options: HttpRetryOptions,
  status: number,
  attemptIndex: number,
  maxAttempts: number,
): boolean {
  if (attemptIndex >= maxAttempts - 1) {
    return false;
  }
  if (!RETRYABLE_STATUS_CODES.has(status)) {
    return false;
  }
  if (options.retry === true) {
    return true;
  }
  if (options.retry === false) {
    return false;
  }
  return isRetryableMethod(options.method);
}

export async function delayBeforeHttpRetry(
  attemptIndex: number,
  retryAfterHeader: string | null,
): Promise<void> {
  const delayMs = computeRetryDelayMs(attemptIndex, retryAfterHeader);
  await sleep(delayMs);
}
