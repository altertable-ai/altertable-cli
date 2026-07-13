/**
 * Stable exit codes for scripting — do not renumber without a major version bump.
 *
 * | Code | Constant           | Meaning                          |
 * |------|--------------------|----------------------------------|
 * | 0    | EXIT_SUCCESS       | Success                          |
 * | 1    | EXIT_GENERIC       | Usage, validation, unexpected    |
 * | 2    | EXIT_AUTH          | HTTP 401                         |
 * | 3    | EXIT_FORBIDDEN     | HTTP 403                         |
 * | 4    | EXIT_NOT_FOUND     | HTTP 404                         |
 * | 5    | EXIT_CONFLICT      | HTTP 409                         |
 * | 6    | EXIT_VALIDATION    | HTTP 422 / ParseError            |
 * | 7    | EXIT_RATE_LIMIT    | HTTP 429                         |
 * | 8    | EXIT_SERVER        | HTTP 5xx                         |
 * | 9    | EXIT_NETWORK       | NetworkError, TimeoutError       |
 * | 10   | EXIT_CONFIG        | ConfigurationError               |
 */
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export const EXIT_SUCCESS = 0;
export const EXIT_GENERIC = 1;
export const EXIT_AUTH = 2;
const EXIT_FORBIDDEN = 3;
export const EXIT_NOT_FOUND = 4;
const EXIT_CONFLICT = 5;
export const EXIT_VALIDATION = 6;
const EXIT_RATE_LIMIT = 7;
export const EXIT_SERVER = 8;
export const EXIT_NETWORK = 9;
export const EXIT_CONFIG = 10;

export type CliErrorOptions = {
  exitCode?: number;
  cause?: unknown;
  details?: string;
};

export class CliError extends Error {
  exitCode: number;
  cause?: unknown;
  details?: string;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? EXIT_GENERIC;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export class ConfigurationError extends CliError {
  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, { ...options, exitCode: options.exitCode ?? EXIT_CONFIG });
    this.name = "ConfigurationError";
  }
}

function httpStatusExitCode(status: number): number {
  if (status === 401) {
    return EXIT_AUTH;
  }
  if (status === 403) {
    return EXIT_FORBIDDEN;
  }
  if (status === 404) {
    return EXIT_NOT_FOUND;
  }
  if (status === 409) {
    return EXIT_CONFLICT;
  }
  if (status === 422) {
    return EXIT_VALIDATION;
  }
  if (status === 429) {
    return EXIT_RATE_LIMIT;
  }
  if (status >= 500) {
    return EXIT_SERVER;
  }
  if (status >= 400) {
    return EXIT_GENERIC;
  }
  return EXIT_GENERIC;
}

export class HttpError extends CliError {
  status: number;
  body: string;
  method: string;
  url: string;
  parsedDetail?: string;
  retryAfterHeader?: string | null;

  constructor(options: {
    status: number;
    body: string;
    method: string;
    url: string;
    parsedDetail?: string;
    exitCode?: number;
    authPlane?: AuthPlane;
    retryAfterHeader?: string | null;
  }) {
    super(`Request failed with status ${options.status}.`, {
      exitCode: options.exitCode ?? httpStatusExitCode(options.status),
      details: options.parsedDetail,
    });
    this.name = "HttpError";
    this.status = options.status;
    this.body = options.body;
    this.method = options.method;
    this.url = options.url;
    this.parsedDetail = options.parsedDetail;
    this.retryAfterHeader = options.retryAfterHeader;
    this.message = httpStatusMessage(options.status, options.authPlane);
  }
}

export class NetworkError extends CliError {
  constructor(message = "Request failed (network error).", options: CliErrorOptions = {}) {
    super(message, { ...options, exitCode: options.exitCode ?? EXIT_NETWORK });
    this.name = "NetworkError";
  }
}

export class TimeoutError extends NetworkError {
  constructor(message = "Request timed out.", options: CliErrorOptions = {}) {
    super(message, options);
    this.name = "TimeoutError";
  }
}

export class ParseError extends CliError {
  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, { ...options, exitCode: options.exitCode ?? EXIT_VALIDATION });
    this.name = "ParseError";
  }
}

export type AuthPlane = "lakehouse" | "management";

export function httpStatusMessage(status: number, authPlane?: AuthPlane): string {
  if (status === 401) {
    if (authPlane === "lakehouse") {
      return "Authentication failed (401). Check lakehouse credentials (username/password or Basic token).";
    }
    if (authPlane === "management") {
      return "Authentication failed (401). Check your management API key.";
    }
    return "Authentication failed (401). Check your credentials.";
  }
  if (status === 403) {
    return "Permission denied (403).";
  }
  if (status === 404) {
    return "Not found (404).";
  }
  if (status === 429) {
    return "Rate limited (429). Try again later.";
  }
  if (status >= 500) {
    return `Server error (${status}). Try again later.`;
  }
  return `Request failed with status ${status}.`;
}

export type CliErrorJson = {
  error: true;
  code: string;
  message: string;
  exit_code: number;
  details?: string;
  status?: number;
};

export function errorCodeFromError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return "auth_failed";
    }
    if (error.status === 403) {
      return "forbidden";
    }
    if (error.status === 404) {
      return "not_found";
    }
    if (error.status === 409) {
      return "conflict";
    }
    if (error.status === 422) {
      return "validation_error";
    }
    if (error.status === 429) {
      return "rate_limited";
    }
    if (error.status >= 500) {
      return "server_error";
    }
    return "http_error";
  }
  if (error instanceof ConfigurationError) {
    return "configuration_error";
  }
  if (error instanceof ParseError) {
    return "parse_error";
  }
  if (error instanceof TimeoutError) {
    return "timeout_error";
  }
  if (error instanceof NetworkError) {
    return "network_error";
  }
  if (error instanceof CliError) {
    return "cli_error";
  }
  if (error instanceof Error && error.name === "CLIError") {
    return "usage_error";
  }
  return "unexpected_error";
}

export function serializeCliError(error: unknown): CliErrorJson {
  const exitCode = getCliExitCode(error);
  const code = errorCodeFromError(error);

  if (error instanceof HttpError) {
    return {
      error: true,
      code,
      message: error.message,
      exit_code: exitCode,
      ...(error.parsedDetail ? { details: error.parsedDetail } : {}),
      status: error.status,
    };
  }

  if (error instanceof CliError) {
    return {
      error: true,
      code,
      message: error.message,
      exit_code: exitCode,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  if (error instanceof Error && error.name === "CLIError") {
    return {
      error: true,
      code: "usage_error",
      message: error.message,
      exit_code: EXIT_GENERIC,
    };
  }

  return {
    error: true,
    code: "unexpected_error",
    message: "Unexpected error.",
    exit_code: EXIT_GENERIC,
  };
}

export function renderCliErrorJson(error: unknown): string {
  return JSON.stringify(serializeCliError(error));
}

export function renderCliError(error: unknown): string {
  if (error instanceof CliError) {
    return renderDisplayText([span("ERROR", "error"), span(` ${error.message}`)]);
  }
  if (error instanceof Error && error.name === "CLIError") {
    return renderDisplayText([span("ERROR", "error"), span(` ${error.message}`)]);
  }
  return renderDisplayText([span("ERROR", "error"), span(" Unexpected error.")]);
}

export function getCliExitCode(error: unknown): number {
  if (error instanceof CliError) {
    return error.exitCode;
  }
  if (error instanceof Error && error.name === "CLIError") {
    return EXIT_GENERIC;
  }
  return EXIT_GENERIC;
}

export function isCittyCliError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && error.name === "CLIError" && "code" in error;
}

export function shouldShowCommandExamplesOnError(error: unknown): boolean {
  if (!(error instanceof CliError)) {
    return false;
  }
  if (
    error instanceof HttpError ||
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ParseError
  ) {
    return false;
  }
  return error.exitCode === EXIT_GENERIC || error.exitCode === EXIT_CONFIG;
}
