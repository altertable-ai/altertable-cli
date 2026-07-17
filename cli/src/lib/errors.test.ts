import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CliError,
  ConfigurationError,
  EXIT_AUTH,
  EXIT_CONFIG,
  EXIT_GENERIC,
  EXIT_NETWORK,
  EXIT_NOT_FOUND,
  EXIT_SERVER,
  EXIT_VALIDATION,
  HttpError,
  NetworkError,
  ParseError,
  TimeoutError,
  errorCodeFromError,
  getCliExitCode,
  httpStatusMessage,
  serializeCliError,
  shouldShowCommandExamplesOnError,
} from "@/lib/errors.ts";
import { renderCliError, renderCliErrorDetails, renderCliErrorJson } from "@/ui/error.ts";
import {
  forceNoTerminalColorForTests,
  restoreTerminalState,
  snapshotTerminalState,
  type TerminalTestState,
} from "@/test-utils/terminal.ts";

let terminalState: TerminalTestState;

beforeEach(() => {
  terminalState = snapshotTerminalState();
  forceNoTerminalColorForTests();
});

afterEach(() => {
  restoreTerminalState(terminalState);
});

describe("errors", () => {
  test("renderCliError formats CliError", () => {
    expect(renderCliError(new CliError("x"))).toBe("ERROR x");
  });

  test("renderCliErrorDetails preserves trusted line structure and sanitizes each line", () => {
    const rendered = renderCliErrorDetails("First line\nRun this\u001b]0;spoofed\u0007");

    expect(rendered).toBe("ERROR First line\nRun this\\x1b]0;spoofed\\x07");
    expect(rendered).not.toContain("\\x0a");
    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("\u0007");
  });

  test("ConfigurationError uses EXIT_CONFIG", () => {
    const error = new ConfigurationError("missing config");
    expect(error.exitCode).toBe(EXIT_CONFIG);
    expect(error.name).toBe("ConfigurationError");
  });

  test("unknown errors render without stack traces", () => {
    const rendered = renderCliError(new TypeError("secret internal detail"));
    expect(rendered).toBe("ERROR Unexpected error.");
    expect(rendered).not.toContain("secret internal detail");
    expect(rendered).not.toContain("TypeError");
  });

  test("shouldShowCommandExamplesOnError is true for usage CliErrors", () => {
    expect(shouldShowCommandExamplesOnError(new CliError("Endpoint path is required."))).toBe(true);
    expect(shouldShowCommandExamplesOnError(new ConfigurationError("Not configured."))).toBe(true);
  });

  test("shouldShowCommandExamplesOnError is false for transport and HTTP errors", () => {
    expect(
      shouldShowCommandExamplesOnError(
        new HttpError({ status: 404, body: "", method: "GET", url: "/x" }),
      ),
    ).toBe(false);
    expect(shouldShowCommandExamplesOnError(new NetworkError())).toBe(false);
    expect(shouldShowCommandExamplesOnError(new TimeoutError())).toBe(false);
    expect(shouldShowCommandExamplesOnError(new ParseError("bad json"))).toBe(false);
  });
});

describe("HttpError exit codes", () => {
  test("maps HTTP status to semantic exit codes", () => {
    expect(new HttpError({ status: 401, body: "", method: "GET", url: "/x" }).exitCode).toBe(
      EXIT_AUTH,
    );
    expect(new HttpError({ status: 404, body: "", method: "GET", url: "/x" }).exitCode).toBe(
      EXIT_NOT_FOUND,
    );
    expect(new HttpError({ status: 403, body: "", method: "GET", url: "/x" }).exitCode).toBe(3);
    expect(new HttpError({ status: 409, body: "", method: "POST", url: "/x" }).exitCode).toBe(5);
    expect(new HttpError({ status: 429, body: "", method: "GET", url: "/x" }).exitCode).toBe(7);
    expect(new HttpError({ status: 422, body: "", method: "GET", url: "/x" }).exitCode).toBe(
      EXIT_VALIDATION,
    );
    expect(new HttpError({ status: 500, body: "", method: "GET", url: "/x" }).exitCode).toBe(
      EXIT_SERVER,
    );
    expect(new HttpError({ status: 418, body: "", method: "GET", url: "/x" }).exitCode).toBe(
      EXIT_GENERIC,
    );
  });
});

describe("transport error exit codes", () => {
  test("NetworkError and TimeoutError use EXIT_NETWORK", () => {
    expect(new NetworkError().exitCode).toBe(EXIT_NETWORK);
    expect(new TimeoutError().exitCode).toBe(EXIT_NETWORK);
  });

  test("ParseError uses EXIT_VALIDATION", () => {
    expect(new ParseError("bad json").exitCode).toBe(EXIT_VALIDATION);
  });
});

describe("HttpError messages", () => {
  test("401 with lakehouse plane mentions lakehouse credentials", () => {
    const error = new HttpError({
      status: 401,
      body: "",
      method: "POST",
      url: "/query",
      authPlane: "lakehouse",
    });
    expect(error.message).toContain("lakehouse credentials");
  });

  test("401 with management plane mentions management API key", () => {
    const error = new HttpError({
      status: 401,
      body: "",
      method: "GET",
      url: "/whoami",
      authPlane: "management",
    });
    expect(error.message).toContain("management API key");
  });

  test("401 without plane uses generic credentials message", () => {
    const error = new HttpError({
      status: 401,
      body: "",
      method: "GET",
      url: "/x",
    });
    expect(error.message).toContain("Check your credentials.");
  });

  test("httpStatusMessage matches HttpError for each plane", () => {
    expect(httpStatusMessage(401, "lakehouse")).toContain("lakehouse credentials");
    expect(httpStatusMessage(401, "management")).toContain("management API key");
    expect(httpStatusMessage(401)).toContain("Check your credentials.");
  });
});

describe("JSON error envelope", () => {
  test("HttpError serializes with status and stable code", () => {
    const error = new HttpError({
      status: 401,
      body: '{"error":"invalid key"}',
      method: "GET",
      url: "https://api.example.com/whoami",
      parsedDetail: "invalid key",
      authPlane: "management",
    });
    const json = serializeCliError(error);
    expect(json).toEqual({
      error: true,
      code: "auth_failed",
      message: "Authentication failed (401). Check your management API key.",
      exit_code: EXIT_AUTH,
      details: "invalid key",
      status: 401,
    });
    expect(JSON.parse(renderCliErrorJson(error))).toEqual(json);
  });

  test("ConfigurationError serializes with configuration_error code", () => {
    const json = serializeCliError(new ConfigurationError("No API key configured."));
    expect(json.code).toBe("configuration_error");
    expect(json.exit_code).toBe(EXIT_CONFIG);
    expect(json.error).toBe(true);
  });

  test("citty usage errors serialize as usage_error", () => {
    const usageError = new Error("Missing required argument: statement");
    usageError.name = "CLIError";
    Object.assign(usageError, { code: "ERR_MISSING_ARGS" });

    expect(errorCodeFromError(usageError)).toBe("usage_error");
    expect(getCliExitCode(usageError)).toBe(EXIT_GENERIC);
    const json = serializeCliError(usageError);
    expect(json.code).toBe("usage_error");
    expect(json.exit_code).toBe(EXIT_GENERIC);
  });

  test("unexpected errors serialize without leaking internals", () => {
    const json = serializeCliError(new TypeError("secret stack detail"));
    expect(json.code).toBe("unexpected_error");
    expect(json.message).toBe("Unexpected error.");
    expect(JSON.stringify(json)).not.toContain("secret");
  });
});
