import { ParseError, QueryError } from '@/lib/errors.ts';
import { isRecord } from '@/lib/object.ts';
import { readTextStreamLines } from '@/lib/stream-lines.ts';

export type LakehouseQueryMetadata = {
  statement?: string;
  rows_limit?: number | null;
  rows_offset?: number | null;
  init_time_ms?: number;
  connections_errors?: Record<string, unknown>;
  session_id?: string;
  query_id?: string;
  worker_slug?: string;
  [key: string]: unknown;
};

export type LakehouseColumn = {
  name?: string;
  type?: string;
  [key: string]: unknown;
};

export type LakehouseRow = Record<string, unknown> | unknown[];

export type LakehouseQueryResult = {
  metadata: LakehouseQueryMetadata;
  columns: string[] | LakehouseColumn[];
  rows: LakehouseRow[];
};

function isColumnNameArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every(entry => typeof entry === 'string')
  );
}

function isColumnObjectArray(value: unknown): value is LakehouseColumn[] {
  return Array.isArray(value) && value.every(isRecord);
}

// Default query NDJSON uses array rows and a standalone {error: string} record.
// Native JSONL uses object rows, where an `error` column is valid user data.
function parseProtocolLine(line: string, lineNumber: number): unknown {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new ParseError(
      `Failed to parse query response at line ${lineNumber}.`,
      {
        details: line,
        cause: error,
      }
    );
  }
  if (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    typeof value.error === 'string'
  ) {
    throw new QueryError(value.error, { details: `Line ${lineNumber}` });
  }
  return value;
}

function readQueryLine(
  result: LakehouseQueryResult | undefined,
  line: string,
  lineNumber: number
): LakehouseQueryResult {
  if (line.trim().length === 0) {
    if (result) return result;
    throw new ParseError('Query response is empty.');
  }

  const value = parseProtocolLine(line, lineNumber);
  if (!result) {
    if (!isRecord(value)) {
      throw new ParseError('Query response metadata must be a JSON object.', {
        details: `Line ${lineNumber}: ${line}`,
      });
    }
    return { metadata: value, columns: [], rows: [] };
  }

  if (
    lineNumber === 2 &&
    (isColumnNameArray(value) || isColumnObjectArray(value))
  ) {
    result.columns = value;
  } else {
    if (!Array.isArray(value) && !isRecord(value)) {
      throw new ParseError(
        'Query response row must be a JSON array or object.',
        {
          details: `Line ${lineNumber}: ${line}`,
        }
      );
    }
    result.rows.push(value);
  }
  return result;
}

export function parseLakehouseQueryResponse(
  responseBody: string
): LakehouseQueryResult {
  let result: LakehouseQueryResult | undefined;
  let lineNumber = 0;
  for (const line of responseBody.split('\n')) {
    result = readQueryLine(result, line, ++lineNumber);
  }
  if (!result) throw new ParseError('Query response is empty.');
  return result;
}

export async function parseLakehouseQueryStream(
  stream: ReadableStream<Uint8Array>
): Promise<LakehouseQueryResult> {
  let result: LakehouseQueryResult | undefined;
  let lineNumber = 0;
  for await (const line of readTextStreamLines(stream)) {
    result = readQueryLine(result, line, ++lineNumber);
  }
  if (!result) throw new ParseError('Query response is empty.');
  return result;
}
