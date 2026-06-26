# Lakehouse API Client Specification

This specification defines requirements for implementing a language-idiomatic, strongly typed (or as strongly typed as idiomatic for the target language—best effort for dynamic or scripting languages), open-source client for the Altertable Lakehouse API.

Primary OpenAPI specification reference: `https://api.altertable.ai/openapi/lakehouse.json`

## Required Outcomes

1. Full endpoint coverage: `append` (including optional synchronous completion and task polling), `GET /tasks/{task_id}`, `query` (streamed and accumulated), `GET`/`DELETE /query/{query_id}`, `upload`, `validate`, and `autocomplete`.
2. Package is publishable to the target language's primary registry.
3. Typed models and typed errors are first-class.
4. `/query` exposes both streamed (with metadata, columns, and row iterator) and accumulated (with all rows) versions.
5. Tests provide confidence in real runtime behavior.
6. Project is modern OSS with MIT licensing.

## Requirements

Follow these phases in order.

### Phase 1: Scaffold

1. Create package/module scaffold with idiomatic structure.
2. Add MIT license.
3. Add README, changelog, and contribution docs.
4. Configure lint/typecheck/test scripts.
5. Generate a comprehensive `.gitignore` using `https://www.toptal.com/developers/gitignore/api/{language}` as a reference.

### Phase 2: Models and Serialization

1. Generate or define request/response models from OpenAPI.
2. Preserve enums and nullable semantics:
   - `ComputeSize`: `XS | S | M | L | XL`
   - `UploadFormat`: `csv | json | parquet`
   - `UploadMode`: `create | append | upsert | overwrite`
   - `AppendErrorCode`: `invalid-data | incompatible-schema`
   - `TaskStatus`: `pending | completed`
   - `SessionKind` (for `QueryLog.client_interface`): `ArrowFlightSQL | HttpQuery | HttpCancel | HttpValidate | HttpExplain | HttpAutocomplete | Postgres`
3. Preserve `oneOf` behavior for `AppendRequest` exactly as in OpenAPI: the JSON body is **either** a single `AppendPayload` object **or** a JSON array of `AppendPayload` objects.
4. Model `AppendResponse` per OpenAPI: required `ok`; nullable `error_code` (`AppendErrorCode` or null); nullable `error_message`; nullable `task_id` (UUID) for polling via `GET /tasks/{task_id}`.

### Phase 3: Client Core

Implement a configurable client constructor/factory with:

- `baseUrl` (default `https://api.altertable.ai`)
- auth options (see Authentication)
- timeout configuration
- retry policy
- optional user-agent suffix

### Phase 4: Endpoint Methods

Implement typed methods for all operations:

1. `append`

   - `POST /append`
   - required query params: `catalog`, `schema`, `table`
   - optional query param: `sync` — when true, the server waits for the append task to finish before returning
   - JSON request body: `AppendRequest`
   - typed response: `AppendResponse` (`ok`, nullable `error_code`, nullable `error_message`, nullable `task_id`)

2. `getTask` (or `get_task`)

   - `GET /tasks/{task_id}`
   - path param: `task_id` (UUID), as returned by `append` when processing is asynchronous
   - typed response: `TaskResponse` (`task_id`, `status` where `status` is `TaskStatus`)

3. `query`

   Two versions must be provided:

   a. `query` (streamed)

   - `POST /query`
   - JSON body: `QueryRequest` (must include `statement`)
   - content type: `application/x-ndjson`
   - returns a structured result containing:
     - metadata
     - columns
     - an enumerator/iterator/async iterator/observable/channel to iterate over streamed rows

   b. `queryAll` (or `query_all`, accumulated)

   - `POST /query`
   - JSON body: `QueryRequest` (must include `statement`)
   - accumulates all rows from the stream before returning
   - returns a structured result containing:
     - metadata
     - columns
     - all rows as an array/list/collection

4. `upload`

   - `POST /upload`
   - required query params: `catalog`, `schema`, `table`, `format`, `mode`
   - conditional param: `primary_key` is required when `mode=upsert`
   - body: `application/octet-stream` bytes or stream

5. `getQuery` (or `get_query`)

   - `GET /query/{query_id}`
   - path param: `query_id` (UUID)
   - typed response: `QueryLogResponse`
   - returns query log information including stats, progress, duration, error

6. `cancelQuery` (or `cancel_query`)

   - `DELETE /query/{query_id}`
   - path param: `query_id` (UUID)
   - required query param: `session_id`
   - typed response: `CancelQueryResponse`
   - cancels a running query

7. `validate`

   - `POST /validate`
   - JSON body: `ValidateRequest` (must include `statement`)
   - typed response: `ValidateResponse`

8. `autocomplete`

   - `POST /autocomplete`
   - JSON body: `AutocompleteRequest` (must include `statement`)
   - typed response: `AutocompleteResponse`

### Phase 5: Streaming Contract (`query`)

The streamed `query` method must parse the NDJSON response and return a structured result with:

1. **metadata** - Query metadata (parsed from the first JSON object line). Parsers must accept the fields defined in OpenAPI (non-exhaustive examples aligned with the published spec): `statement`, `rows_limit`, `rows_offset`, `init_time_ms`, `connections_errors`, `session_id`, `query_id`, `worker_slug`. Treat unknown keys as forward-compatible passthrough or opaque map entries where idiomatic.
2. **columns** - Column schema information (parsed when schema row appears)
3. **rows iterator** - An enumerator/iterator/async iterator/observable/channel to iterate over streamed rows

The accumulated `queryAll` method should:

- Call `query` with the same request and accumulate the rows into a single array/list/collection
- Return metadata, columns, and all rows

Requirements:

- Include line index/context in parsing failures.
- Never silently ignore malformed lines.
- Preserve backpressure semantics of the language runtime (for streamed version).

### Phase 6: Authentication

The Altertable Lakehouse API uses standard HTTP Basic Auth. Credentials are sent in every request as:

```
Authorization: Basic <base64(username:password)>
```

The client must support all of the following credential input patterns:

1. **Direct credentials** — `username` + `password` accepted in the client constructor/config; the SDK encodes them into the Basic token internally.
2. **Pre-encoded token** — accept a raw pre-encoded `Basic` token string directly for callers who already hold the encoded value.
3. **Environment variable discovery** — auto-discover from the environment:
   - `ALTERTABLE_USERNAME` + `ALTERTABLE_PASSWORD` (encode on the fly), or
   - `ALTERTABLE_BASIC_AUTH_TOKEN` (use directly as the pre-encoded value)

Implementation requirements:

- Credentials must never appear in logs, error messages, or debug output.
- A `ConfigurationError` must be raised at construction time when no credentials can be resolved.

### Phase 7: Error Model

Implement a typed error hierarchy at minimum:

- `AuthError`
- `BadRequestError`
- `NetworkError`
- `TimeoutError`
- `SerializationError`
- `ParseError`
- `ApiError` (unexpected status fallback)
- `ConfigurationError`

All errors should include, when available:

- operation name
- HTTP method/path
- status code
- retriable flag/classification
- request/correlation id headers
- underlying cause

### Phase 8: Transport and Reliability

**For HTTP client performance best practices**, including keep-alive, timeout defaults, and language-specific HTTP client recommendations, read and follow the [HTTP transport spec](../http/SPEC.md).

### Phase 9: Testing

Implement layered tests:

1. Unit tests

   - model serialization
   - request construction
   - auth behavior and redaction
   - retries/timeouts
   - input precondition checks

2. Integration tests — run against `ghcr.io/altertable-ai/altertable-mock:latest`

   The mock server speaks the full Altertable Lakehouse API. Credentials are configured via the `ALTERTABLE_MOCK_USERS` environment variable, server listens on port `15000`.

   Use a **dual-mode** approach so tests always run — both locally and in CI — without real credentials:

   **In CI (GitHub Actions):** declare the mock as a service container so it is pre-bound to `localhost:15000` before the test step starts:

   ```yaml
   services:
     altertable:
       image: ghcr.io/altertable-ai/altertable-mock:latest
       ports:
         - 15000:15000
       env:
         ALTERTABLE_MOCK_USERS: testuser:testpass
       options: >-
         --health-cmd "exit 0"
         --health-interval 5s
         --health-timeout 3s
         --health-retries 3
         --health-start-period 10s
   ```

   **Outside CI (local development):** use the language-native Testcontainers library to pull and start the mock automatically before the test suite, store the mapped port in an environment variable (e.g. `ALTERTABLE_MOCK_PORT`), and stop the container via an `at_exit` / teardown hook. Skip this step when the `CI` environment variable is set.

   The test base URL is always `http://localhost:${ALTERTABLE_MOCK_PORT:-15000}`. Point every test client instance at this URL.

   Cover at minimum:

   - one streamed `query` call verifying metadata (including documented metadata keys where the mock emits them), columns, and row iteration
   - one `queryAll` call verifying all rows are accumulated
   - one `getQuery` call verifying the query log response
   - one `cancelQuery` call verifying the cancellation response
   - one `upload` call (CSV or JSON payload)
   - one `validate` call
   - one `append` call
   - one `getTask` call when the mock exposes a task id (or append returns `task_id`), verifying `TaskResponse`
   - one `autocomplete` call verifying suggestions and `connections_errors`

CI should always run lint + typecheck + unit + integration tests (mock-backed). No test should be skipped due to missing credentials.

### Packaging requirements

1. Include examples for all operations (`append`, `getTask`, `query`, `queryAll`, `getQuery`, `cancelQuery`, `upload`, `validate`, `autocomplete`) in the README.
2. Verify docs match runtime behavior.

## Endpoint Reference (Minimal)

### `POST /append`

- Query: `catalog`, `schema`, `table`, optional `sync`
- Body: `AppendRequest`
- Response: `AppendResponse` — required `ok`; nullable `error_code` (`invalid-data` \| `incompatible-schema` \| null); nullable `error_message`; nullable `task_id` (UUID) for `GET /tasks/{task_id}`

### `GET /tasks/{task_id}`

- Path: `task_id` (UUID)
- Response: `TaskResponse` with `task_id` and `status` (`pending` \| `completed`)
- Status codes: 200, 400 (invalid task id), 401

### `POST /query`

- Body: `QueryRequest`
- Response: NDJSON stream
- Key request fields:
  - required: `statement`
  - optional: `catalog`, `schema`, `session_id`, `compute_size`, `sanitize`, `limit`, `offset`, `timezone`, `ephemeral`, `visible`, `requested_by`, `query_id`, `cache`

### `POST /upload`

- Query: `catalog`, `schema`, `table`, `format`, `mode`, optional `primary_key`
- Constraint: `primary_key` required for `mode=upsert`
- Body: binary file content

### `GET /query/{query_id}`

- Path: `query_id` (UUID)
- Response: `QueryLogResponse` containing query log information
- Returns: query metadata including `uuid`, `start_time`, `end_time`, `duration_ms`, `query`, `session_id`, `client_interface` (`SessionKind`), `error`, `stats` (with `caching`, `memory`, `scan`), `progress`, `visible`, `requested_by`, `user_agent`
- Status codes: 200 (success), 401 (auth required), 404 (query not found)

### `DELETE /query/{query_id}`

- Path: `query_id` (UUID)
- Query: `session_id` (required)
- Response: `CancelQueryResponse` with `cancelled` (boolean) and `message` (string)
- Status codes: 200 (success), 400 (invalid request), 401 (auth required), 404 (session not found)
- Cancels a running query associated with the given session

### `POST /validate`

- Body: `ValidateRequest` with required `statement`
- Response: `ValidateResponse` with `valid`, `statement`, `connections_errors`, optional `error`

### `POST /autocomplete`

- Body: `AutocompleteRequest` with required `statement`; optional `catalog`, `schema`, `session_id`, `max_suggestions`
- Response: `AutocompleteResponse` with `suggestions`, `statement`, `connections_errors`
- Status codes: 200, 400, 401

## Acceptance Checklist

Only mark implementation complete when all are true:

- [ ] All operations in Phase 4 implemented and documented (`append`, `getTask`, `query` streamed and accumulated, `getQuery`, `cancelQuery`, `upload`, `validate`, `autocomplete`)
- [ ] Streamed `query` returns metadata, columns, and row iterator; accumulated `queryAll` returns metadata, columns, and all rows
- [ ] Typed errors are comprehensive and actionable
- [ ] Auth supports direct/env/provider patterns
- [ ] Retries/timeouts/transport hooks are configurable
- [ ] Tests provide real-world confidence via the mock server (runs in both CI and local dev)
- [ ] Package is publish-ready for primary registry
- [ ] MIT license and OSS docs are present
