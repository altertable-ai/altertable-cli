import { ParseError, QueryError } from '@/lib/errors.ts';
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

export type LakehouseQueryStreamResult = {
  metadata: LakehouseQueryMetadata;
  columns: string[] | LakehouseColumn[];
  rows: LakehouseRow[];
};

function isColumnNameArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(entry => typeof entry === 'string')
  );
}

function isColumnObjectArray(value: unknown): value is LakehouseColumn[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      entry =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    )
  );
}

function parseMetadataLine(
  line: string,
  lineNumber: number
): LakehouseQueryMetadata {
  const parsedMetadata = parseProtocolLine(line, lineNumber);
  if (
    typeof parsedMetadata !== 'object' ||
    parsedMetadata === null ||
    Array.isArray(parsedMetadata)
  ) {
    throw new ParseError('Query response metadata must be a JSON object.', {
      details: `Line ${lineNumber}: ${line}`,
    });
  }
  return parsedMetadata as LakehouseQueryMetadata;
}

function parseOptionalColumnsLine(
  line: string,
  lineNumber: number
): string[] | LakehouseColumn[] | undefined {
  const parsedLine = parseProtocolLine(line, lineNumber);
  if (isColumnNameArray(parsedLine) || isColumnObjectArray(parsedLine)) {
    return parsedLine;
  }
  return undefined;
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
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    'error' in value &&
    typeof value.error === 'string'
  ) {
    throw new QueryError(value.error);
  }
  return value;
}

function parseRowLine(line: string, lineNumber: number): LakehouseRow {
  return parseProtocolLine(line, lineNumber) as LakehouseRow;
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  const trimmedLines = [...lines];
  while (trimmedLines.length > 0) {
    const lastLine = trimmedLines[trimmedLines.length - 1];
    if (lastLine === undefined || lastLine.trim().length > 0) {
      break;
    }
    trimmedLines.pop();
  }
  return trimmedLines;
}

export async function parseLakehouseQueryHeader(
  lineSource: AsyncIterable<string>
): Promise<{
  metadata: LakehouseQueryMetadata;
  columns: string[] | LakehouseColumn[];
  lineIterator: AsyncIterator<string, void, undefined>;
  lineNumber: number;
  pendingRowLine?: string;
}> {
  const lineIterator = lineSource[Symbol.asyncIterator]();
  try {
    const firstResult = await lineIterator.next();
    if (firstResult.done || firstResult.value.trim().length === 0) {
      throw new ParseError('Query response is empty.');
    }

    const metadata = parseMetadataLine(firstResult.value, 1);
    let columns: string[] | LakehouseColumn[] = [];
    let lineNumber = 2;
    let pendingRowLine: string | undefined;

    const secondResult = await lineIterator.next();
    if (!secondResult.done) {
      const parsedColumns = parseOptionalColumnsLine(
        secondResult.value,
        lineNumber
      );
      if (parsedColumns !== undefined) {
        columns = parsedColumns;
        lineNumber += 1;
      } else {
        pendingRowLine = secondResult.value;
      }
    }

    return {
      metadata,
      columns,
      lineIterator,
      lineNumber,
      pendingRowLine,
    };
  } catch (error) {
    await lineIterator.return?.();
    throw error;
  }
}

export function parseLakehouseQueryResponse(
  responseBody: string
): LakehouseQueryResult {
  const trimmedBody = responseBody.trimEnd();
  if (trimmedBody.length === 0) {
    throw new ParseError('Query response is empty.');
  }

  const lines = trimTrailingEmptyLines(trimmedBody.split('\n'));
  if (lines.length === 0) {
    throw new ParseError('Query response is empty.');
  }

  const metadataLine = lines[0];
  if (metadataLine === undefined) {
    throw new ParseError('Query response is empty.');
  }

  const metadata = parseMetadataLine(metadataLine, 1);
  let columns: string[] | LakehouseColumn[] = [];
  const rows: LakehouseRow[] = [];
  let lineIndex = 1;

  if (lineIndex < lines.length) {
    const columnsLine = lines[lineIndex];
    if (columnsLine !== undefined) {
      const parsedColumns = parseOptionalColumnsLine(
        columnsLine,
        lineIndex + 1
      );
      if (parsedColumns !== undefined) {
        columns = parsedColumns;
        lineIndex += 1;
      }
    }
  }

  for (; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined || line.trim().length === 0) {
      continue;
    }
    rows.push(parseRowLine(line, lineIndex + 1));
  }

  return { metadata, columns, rows };
}

export async function* parseLakehouseQueryStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<LakehouseRow, LakehouseQueryStreamResult, undefined> {
  const header = await parseLakehouseQueryHeader(readTextStreamLines(stream));
  const rows: LakehouseRow[] = [];
  let lineNumber = header.lineNumber;

  try {
    if (header.pendingRowLine !== undefined) {
      const pendingLineNumber = lineNumber;
      lineNumber += 1;
      if (header.pendingRowLine.trim().length > 0) {
        const row = parseRowLine(header.pendingRowLine, pendingLineNumber);
        rows.push(row);
        yield row;
      }
    }

    while (true) {
      const nextLine = await header.lineIterator.next();
      if (nextLine.done) {
        break;
      }
      const line = nextLine.value;
      const currentLineNumber = lineNumber;
      lineNumber += 1;
      if (line.trim().length === 0) {
        continue;
      }
      const row = parseRowLine(line, currentLineNumber);
      rows.push(row);
      yield row;
    }

    return { metadata: header.metadata, columns: header.columns, rows };
  } finally {
    await header.lineIterator.return?.();
  }
}
