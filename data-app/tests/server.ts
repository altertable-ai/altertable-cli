import { serveLocalApp } from '@altertable/data-app-bun';

import { dataApp } from '../starter/app.ts';
import starter from '../starter/src/index.html';
import queryResults from './query-results.json';

let mode = 'success';
// Mock only the external lakehouse. The app, operations, query transport and SDK are real.
const lakehouse = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.DATA_APP_TEST_PORT ?? 26418) + 1,
  async fetch(request) {
    if (new URL(request.url).pathname === '/__test/state') {
      mode = await request.text();
      return new Response('ok');
    }
    if (request.headers.get('authorization') !== 'Bearer fixture-token')
      return new Response('Unauthorized', { status: 401 });
    if (mode === 'failure') return new Response('Unavailable', { status: 503 });
    const { statement, params } = (await request.json()) as {
      statement: string;
      params: Record<string, string>;
    };
    const query = Object.entries(dataApp.queries).find(
      ([, definition]) => definition.statement === statement
    )?.[0];
    if (!query) return new Response('Unregistered SQL', { status: 400 });
    // Recorded DuckDB results of the starter's inline VALUES, with no external tables.
    const scenarios = queryResults as Record<
      string,
      Record<string, { columns: string[]; rows: unknown[][] }>
    >;
    const scenario =
      scenarios[`${params.month}/${params.customerName || 'all'}`];
    const result =
      scenario?.[
        query === 'costBreakdown' ? `${query}/${params.breakdown}` : query
      ];
    if (!result)
      return new Response('Missing lakehouse fixture', { status: 400 });
    return new Response(
      [
        JSON.stringify({ query_id: `fixture-${query}` }),
        JSON.stringify(
          result.columns.map(name => ({
            name,
            type:
              name.endsWith('cents') || name.endsWith('count')
                ? 'BIGINT'
                : 'VARCHAR',
          }))
        ),
        ...(mode === 'empty'
          ? []
          : result.rows.map(row => JSON.stringify(row))),
        '',
      ].join('\n'),
      { headers: { 'content-type': 'application/x-ndjson' } }
    );
  },
});
process.env.ALTERTABLE_DATA_PROXY_URL = lakehouse.url.origin;
process.env.ALTERTABLE_DATA_PROXY_TOKEN = 'fixture-token';
serveLocalApp({
  page: starter,
  app: dataApp,
  port: Number(process.env.DATA_APP_TEST_PORT ?? 26418),
});
