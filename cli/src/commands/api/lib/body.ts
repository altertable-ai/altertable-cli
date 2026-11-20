import { readFileSync } from 'node:fs';

import { CliError, ParseError } from '@/lib/errors.ts';
import { readFileArgument } from '@/lib/file-argument.ts';

const BODY_METHOD_NAMES = ['POST', 'PATCH', 'PUT'] as const;
const BODY_METHODS = new Set<string>(BODY_METHOD_NAMES);
const BODY_METHOD_LIST = BODY_METHOD_NAMES.join(', ');
const FIELD_METHOD_NAMES = ['GET', 'DELETE'] as const;
const FIELD_QUERY_METHODS = new Set<string>(FIELD_METHOD_NAMES);

export function readJsonInput(inputArg?: string): string | undefined {
  if (!inputArg) {
    return undefined;
  }
  let body: string;
  if (inputArg === '-') {
    body = readFileSync(0, 'utf8');
  } else {
    try {
      body = readFileSync(inputArg, 'utf8');
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
    throw new ParseError('Invalid JSON body.', { cause: error });
  }
  return body;
}

function parseFieldEntry(entry: string): [string, string] {
  const separatorIndex = entry.indexOf('=');
  if (separatorIndex <= 0) {
    throw new CliError(
      `Invalid field ${JSON.stringify(entry)}. Expected key=value.`
    );
  }
  const key = entry.slice(0, separatorIndex);
  const value = entry.slice(separatorIndex + 1);
  return [key, value];
}

type ExactJsonInteger = {
  kind: 'exact_json_integer';
  json: string;
};

function canonicalizeJsonInteger(value: string): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const canonicalDigits = digits.replace(/^0+/, '') || '0';
  return negative && canonicalDigits !== '0'
    ? `-${canonicalDigits}`
    : canonicalDigits;
}

export type ApiFieldValue = string | number | boolean | null | ExactJsonInteger;

export type ParsedApiField = {
  key: string;
  value: ApiFieldValue;
};

function parseTypedFieldValue(value: string): ApiFieldValue {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (/^-?\d+$/.test(value)) {
    const json = canonicalizeJsonInteger(value);
    const parsed = Number(json);
    return Number.isSafeInteger(parsed)
      ? parsed
      : { kind: 'exact_json_integer', json };
  }
  return readFileArgument(value);
}

function parseRawFields(fields: readonly string[] = []): ParsedApiField[] {
  return fields.map(entry => {
    const [key, value] = parseFieldEntry(entry);
    return { key, value };
  });
}

function parseTypedFields(fields: readonly string[] = []): ParsedApiField[] {
  return fields.map(entry => {
    const [key, value] = parseFieldEntry(entry);
    return { key, value: parseTypedFieldValue(value) };
  });
}

function isExactJsonInteger(value: ApiFieldValue): value is ExactJsonInteger {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.kind === 'exact_json_integer'
  );
}

export function formatApiFieldValue(value: ApiFieldValue): string {
  if (isExactJsonInteger(value)) {
    return value.json;
  }
  return value === null ? 'null' : String(value);
}

function serializeApiFieldValue(value: ApiFieldValue): string {
  return isExactJsonInteger(value) ? value.json : JSON.stringify(value);
}

function serializeApiFields(fields: ParsedApiField[]): string {
  const valuesByKey = new Map<string, ApiFieldValue>();
  for (const field of fields) {
    valuesByKey.set(field.key, field.value);
  }
  const properties = [...valuesByKey].map(
    ([key, value]) => `${JSON.stringify(key)}:${serializeApiFieldValue(value)}`
  );
  return `{${properties.join(',')}}`;
}

export type ResolveApiBodyOptions = {
  method: string;
  input?: string;
  rawFields?: readonly string[];
  typedFields?: readonly string[];
};

export type ResolvedApiRequestPayload = {
  body?: string;
  queryFields: ParsedApiField[];
};

export function resolveApiRequestPayload(
  options: ResolveApiBodyOptions
): ResolvedApiRequestPayload {
  const method = options.method.toUpperCase();
  const inputArg = options.input;
  const rawFields = parseRawFields(options.rawFields);
  const typedFields = parseTypedFields(options.typedFields);
  const parsedFields = [...rawFields, ...typedFields];
  if (!BODY_METHODS.has(method)) {
    if (inputArg) {
      throw new CliError(
        `${method} requests do not accept a body. Use ${BODY_METHOD_LIST} for --input.`
      );
    }
    if (parsedFields.length > 0 && !FIELD_QUERY_METHODS.has(method)) {
      throw new CliError(
        `${method} requests do not accept a body. Use ${BODY_METHOD_LIST} for --input or request fields.`
      );
    }
    return { queryFields: parsedFields };
  }

  if (inputArg) {
    return { body: readJsonInput(inputArg), queryFields: parsedFields };
  }
  if (parsedFields.length > 0) {
    return { body: serializeApiFields(parsedFields), queryFields: [] };
  }
  return { queryFields: [] };
}
