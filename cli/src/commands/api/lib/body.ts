import { readFileSync } from "node:fs";
import { CliError, ParseError } from "@/lib/errors.ts";

const BODY_METHOD_NAMES = ["POST", "PATCH", "PUT"] as const;
const BODY_METHODS = new Set<string>(BODY_METHOD_NAMES);
const BODY_METHOD_LIST = BODY_METHOD_NAMES.join(", ");
const FIELD_METHOD_NAMES = ["GET", "DELETE"] as const;
const FIELD_QUERY_METHODS = new Set<string>(FIELD_METHOD_NAMES);

export function readJsonInput(inputArg?: string): string | undefined {
  if (!inputArg) {
    return undefined;
  }
  let body: string;
  if (inputArg === "-") {
    body = readFileSync(0, "utf8");
  } else {
    try {
      body = readFileSync(inputArg, "utf8");
    } catch {
      throw new CliError(`File not found: ${inputArg}`);
    }
  }

  return validateJsonBody(body);
}

function validateJsonBody(body: string): string {
  try {
    JSON.parse(body);
  } catch (error) {
    throw new ParseError("Invalid JSON body.", { cause: error });
  }
  return body;
}

function normalizeFieldEntries(
  fields: Record<string, string> | string[] | string | undefined,
): string[] {
  if (fields === undefined) {
    return [];
  }
  if (typeof fields === "string") {
    return [fields];
  }
  if (Array.isArray(fields)) {
    return fields;
  }
  return Object.values(fields);
}

function parseFieldEntry(entry: string): [string, string] {
  const separatorIndex = entry.indexOf("=");
  if (separatorIndex <= 0) {
    throw new CliError(`Invalid field ${JSON.stringify(entry)}. Expected key=value.`);
  }
  const key = entry.slice(0, separatorIndex);
  const value = entry.slice(separatorIndex + 1);
  if (key.length === 0) {
    throw new CliError(`Invalid field ${JSON.stringify(entry)}. Expected key=value.`);
  }
  return [key, value];
}

export type ApiFieldValue = string | number | boolean | null;

export type ParsedApiField = {
  key: string;
  value: ApiFieldValue;
};

function parseTypedFieldValue(value: string): ApiFieldValue {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  if (value === "@-") {
    return readFileSync(0, "utf8");
  }
  if (value.startsWith("@")) {
    const filePath = value.slice(1);
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      throw new CliError(`File not found: ${filePath}`);
    }
  }
  return value;
}

function parseRawFields(
  fields: Record<string, string> | string[] | string | undefined,
): ParsedApiField[] {
  return normalizeFieldEntries(fields).map((entry) => {
    const [key, value] = parseFieldEntry(entry);
    return { key, value };
  });
}

function parseTypedFields(
  fields: Record<string, string> | string[] | string | undefined,
): ParsedApiField[] {
  return normalizeFieldEntries(fields).map((entry) => {
    const [key, value] = parseFieldEntry(entry);
    return { key, value: parseTypedFieldValue(value) };
  });
}

function parsedFieldsToRecord(fields: ParsedApiField[]): Record<string, ApiFieldValue> {
  const body: Record<string, ApiFieldValue> = {};
  for (const field of fields) {
    body[field.key] = field.value;
  }
  return body;
}

export type ResolveApiBodyOptions = {
  method: string;
  input?: string;
  rawFields?: Record<string, string> | string[] | string;
  typedFields?: Record<string, string> | string[] | string;
  fields?: Record<string, string> | string[] | string;
};

export type ResolvedApiRequestPayload = {
  body?: string;
  queryFields: ParsedApiField[];
};

export function resolveApiRequestPayload(
  options: ResolveApiBodyOptions,
): ResolvedApiRequestPayload {
  const method = options.method.toUpperCase();
  const inputArg = options.input;
  const rawFields = parseRawFields(options.rawFields ?? options.fields);
  const typedFields = parseTypedFields(options.typedFields);
  const parsedFields = [...rawFields, ...typedFields];
  const hasBody = inputArg !== undefined && inputArg !== "";
  const hasFields = parsedFields.length > 0;

  if (hasBody && hasFields) {
    if (!BODY_METHODS.has(method)) {
      throw new CliError(
        `${method} requests do not accept a body. Use ${BODY_METHOD_LIST} for --input.`,
      );
    }

    return {
      body: readJsonInput(String(inputArg)),
      queryFields: parsedFields,
    };
  }

  if (FIELD_QUERY_METHODS.has(method)) {
    if (hasBody) {
      throw new CliError(
        `${method} requests do not accept a body. Use ${BODY_METHOD_LIST} for --input.`,
      );
    }

    return {
      queryFields: parsedFields,
    };
  }

  if (!BODY_METHODS.has(method)) {
    if (hasBody || hasFields) {
      throw new CliError(
        `${method} requests do not accept a body. Use ${BODY_METHOD_LIST} for --input or request fields.`,
      );
    }
    return { queryFields: [] };
  }

  if (hasBody) {
    return {
      body: readJsonInput(String(inputArg)),
      queryFields: [],
    };
  }

  if (hasFields) {
    return {
      body: JSON.stringify(parsedFieldsToRecord(parsedFields)),
      queryFields: [],
    };
  }

  return { queryFields: [] };
}
