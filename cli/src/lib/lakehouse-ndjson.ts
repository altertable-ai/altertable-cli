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

class QueryResponseReader {
  private result?: LakehouseQueryResult;
  private lineNumber = 0;
  private recordCount = 0;

  read(line: string): void {
    const lineNumber = ++this.lineNumber;
    if (!line.trim()) return;
    this.recordCount++;

    const value = parseProtocolLine(line, lineNumber);
    if (!this.result) {
      if (!isRecord(value)) {
        throw new ParseError('Query response metadata must be a JSON object.', {
          details: `Line ${lineNumber}: ${line}`,
        });
      }
      this.result = { metadata: value, columns: [], rows: [] };
      return;
    }

    if (
      this.recordCount === 2 &&
      (isColumnNameArray(value) || isColumnObjectArray(value))
    ) {
      this.result.columns = value;
    } else {
      if (!Array.isArray(value) && !isRecord(value)) {
        throw new ParseError(
          'Query response row must be a JSON array or object.',
          {
            details: `Line ${lineNumber}: ${line}`,
          }
        );
      }
      this.result.rows.push(value);
    }
  }

  finish(): LakehouseQueryResult {
    if (!this.result) throw new ParseError('Query response is empty.');
    return this.result;
  }
}

export function parseLakehouseQueryResponse(
  responseBody: string
): LakehouseQueryResult {
  const reader = new QueryResponseReader();
  for (const line of responseBody.split('\n')) {
    reader.read(line);
  }
  return reader.finish();
}

export async function parseLakehouseQueryStream(
  stream: ReadableStream<Uint8Array>
): Promise<LakehouseQueryResult> {
  const reader = new QueryResponseReader();
  for await (const line of readTextStreamLines(stream)) {
    reader.read(line);
  }
  return reader.finish();
}
