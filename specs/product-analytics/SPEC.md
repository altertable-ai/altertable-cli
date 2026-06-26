# Product Analytics SDK Specification

This specification defines requirements for implementing a language-idiomatic, open-source client for the Altertable Product Analytics API.

OpenAPI specification: https://api.altertable.ai/openapi/product-analytics.json

Read the OpenAPI spec to manually define typed models and understand request/response schemas. Do not use OpenAPI codegen tools — define models by hand from the spec to keep them idiomatic and minimal.

## Reference Implementation

The canonical implementation is the JavaScript/TypeScript SDK in the [`altertable-js` monorepo](https://github.com/altertable-ai/altertable-js).

Web framework SDKs (React, Vue, Svelte, etc.) belong in this monorepo under `packages/`, not in separate repositories.

Key files:

| File                                                   | Role                                                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONSTANTS.md` (this spec folder)                      | **SDK constants reference** — all config interfaces, defaults, and internal constants. Single source of truth for values referenced throughout this spec. |
| `packages/altertable-js/src/core.ts`                   | Main `Altertable` class — init, track, identify, alias, sessions, consent                                                                                  |
| `packages/altertable-js/src/types.ts`                  | Payload types (`TrackPayload`, `IdentifyPayload`, `AliasPayload`)                                                                                          |
| `packages/altertable-js/src/lib/requester.ts`          | Transport — beacon/fetch, URL construction, timeout                                                                                                        |
| `packages/altertable-js/src/lib/sessionManager.ts`     | Identity state, sessions, consent, device/anonymous/session IDs                                                                                            |
| `packages/altertable-js/src/lib/storage.ts`            | Storage abstraction (memory, cookie, localStorage, sessionStorage)                                                                                         |
| `packages/altertable-js/src/constants.ts`              | SDK constants (reserved IDs, default values, limits)                                                                                                       |
| `packages/altertable-js/src/lib/validateUserId.ts`     | Reserved user ID validation                                                                                                                                |
| `packages/altertable-js/src/lib/error.ts`              | Error types and type guards                                                                                                                                |
| `packages/altertable-js/src/lib/queue.ts`              | Pre-init and consent queue                                                                                                                                 |
| `packages/altertable-js/src/lib/safelyRunOnBrowser.ts` | SSR-safe browser API access                                                                                                                                |
| `packages/altertable-js/test/`                         | Test patterns (Vitest, custom matchers)                                                                                                                    |
| `test-utils/`                                          | Shared test helpers (`toRequestApi`, `toWarnDev`, storage mocks)                                                                                           |

## Platform Tiers

Feature expectations differ by where the SDK runs. Categorize the target language into a tier:

| Tier       | Languages                         | Key Expectations                                                                                          |
| ---------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Web**    | JS/TS                             | Sessions, auto-capture, storage (localStorage/cookie), beacon transport, tracking consent, pre-init queue |
| **Mobile** | Swift, Kotlin                     | Sessions, device persistence (Keychain/SharedPrefs), background flush, app lifecycle hooks                |
| **Server** | Python, Ruby, Java, Go, PHP, Rust | Stateless per-request tracking, explicit IDs required, batch support, no sessions/storage/auto-capture    |

Use the tier to decide which phases below are required (marked per phase).

## Required Outcomes

1. Full endpoint coverage (`track`, `identify`, `alias`).
2. Package is publishable to the target language's primary registry.
3. Typed models and typed errors are first-class (best-effort for dynamic languages).
4. Identity model handles anonymous → identified transitions correctly.
5. Transport is extensible (timeouts, proxy, error hooks).
6. Tests provide confidence in real runtime behavior.
7. MIT license.

## Requirements

### Phase 1: Scaffold

**All tiers.**

1. Create package scaffold with idiomatic structure.
2. Add MIT license, README, changelog.
3. Configure lint/typecheck/test/build scripts.
4. For web tier: set up bundler (e.g. `tsup`); configure `__DEV__`, `__LIB__`, `__LIB_VERSION__` build-time constants.
5. Generate a comprehensive `.gitignore` using `https://www.toptal.com/developers/gitignore/api/{language}` as a reference.

### Phase 2: Models and Serialization

**All tiers.**

Read the OpenAPI spec and manually define typed request/response models from it — do not use codegen tools. Preserve `oneOf` semantics (single payload or array) for batch support.

All three methods (`track`, `identify`, `alias`) accept an optional `timestamp` parameter. The API accepts either an ISO 8601 datetime string (e.g. `"2025-06-15T14:30:00.000Z"`) or a Unix epoch integer (seconds). Default to ISO 8601 when generating the timestamp automatically — it's more debuggable. When the caller provides a timestamp explicitly (common for server-side events that sit in a queue before being sent), accept whichever format they supply and pass it through as-is.

### Phase 3: Client Core

**All tiers.**

Implement a configurable client constructor. The full typed config interfaces (`WebConfig`, `MobileConfig`, `ServerConfig`) and their default values (`WEB_DEFAULTS`, `MOBILE_DEFAULTS`, `SERVER_DEFAULTS`) are defined in [CONSTANTS.md](CONSTANTS.md). Use those types and defaults as-is.

**Server tier**: no sessions, no storage, no auto-capture. The client is stateless. Identity fields (`distinct_id`, `anonymous_id`, `device_id`) are passed explicitly per call — this directly shapes the method signatures for `track`, `identify`, and `alias` on the server tier. See Phase 10 for the exact prototypes.

**Named/keyword arguments for optional parameters (all tiers):** Never create a method where callers must pass `null` or a positional placeholder to reach a later optional argument. Group all optional parameters into a named options object/struct/dict — or use the language's native keyword argument syntax — so callers can supply any subset in any order without dummy positional values. This applies to both the server-tier `options` objects in Phase 10 and any other method that gains multiple optional parameters in the future.

### Phase 4: Identity Model

**All tiers, but implementation differs.**

The SDK manages three identity concepts:

| ID             | Format                                          | Prefix constant       | Purpose                                                                   |
| -------------- | ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| `device_id`    | `{PREFIX_DEVICE_ID}-{uuid}`                     | `PREFIX_DEVICE_ID`    | Stable device identifier, survives reset                                  |
| `distinct_id`  | `{PREFIX_ANONYMOUS_ID}-{uuid}` or user-provided | `PREFIX_ANONYMOUS_ID` | Current identity (anonymous or identified)                                |
| `anonymous_id` | `{PREFIX_ANONYMOUS_ID}-{uuid}` or `null`        | `PREFIX_ANONYMOUS_ID` | Previous anonymous ID after `identify()` — enables backend identity merge |
| `session_id`   | `{PREFIX_SESSION_ID}-{uuid}`                    | `PREFIX_SESSION_ID`   | Groups events within an activity window                                   |

See [CONSTANTS.md](CONSTANTS.md) for prefix values.

#### State transitions

1. **Fresh state**: `distinct_id = anonymous-{uuid}`, `anonymous_id = null`, `session_id = session-{uuid}`.
2. **After `identify(user_id)`**: `distinct_id = user_id`, `anonymous_id = previous distinct_id`.
3. **After `reset()`**: New `session_id`, new `anonymous-{uuid}` as `distinct_id`, `anonymous_id = null`. Device ID preserved unless `resetDeviceId: true`.
4. **Re-identify with different user**: Auto-reset first, then identify.

#### Reserved user IDs

Reject IDs listed in `RESERVED_USER_IDS` (case-insensitive) and `RESERVED_USER_IDS_CASE_SENSITIVE` (case-sensitive). See [CONSTANTS.md](CONSTANTS.md) for the full lists.

**Server tier**: No identity state. `distinct_id` and `anonymous_id` are explicit parameters on every call. Validate reserved IDs but don't manage transitions.

### Phase 5: Session Management

**Web and mobile tiers only.**

- Session TTL: `SESSION_EXPIRATION_TIME_MS` (see [CONSTANTS.md](CONSTANTS.md)).
- Renew session (new `session_id`) on first event after TTL expires.
- Persist `lastEventAt` timestamp to detect expiry across page loads / app restarts.
- `session_id` is attached to every `track` payload.

### Phase 6: Storage and Persistence

**Web and mobile tiers only.**

#### Web tier

Implement a `StorageApi` interface with `getItem`, `setItem`, `removeItem`, `migrate`.

Backends (with automatic fallback chain):

1. `localStorage+cookie` (default) — write to both, read from localStorage first
2. `localStorage`
3. `sessionStorage`
4. `cookie`
5. `memory` (final fallback)

Test storage availability before use. Log warnings on fallback.

Storage key format: `{STORAGE_KEY_PREFIX}{STORAGE_KEY_SEPARATOR}{apiKey}{STORAGE_KEY_SEPARATOR}{environment}` (see [CONSTANTS.md](CONSTANTS.md) for values).

Support runtime storage migration when `persistence` config changes via `configure()`.

#### Mobile tier

Use platform-native secure storage (Keychain on iOS, EncryptedSharedPreferences on Android). Fallback to standard storage if unavailable.

**Linux CI Compatibility:**
Mobile SDKs often run unit tests on Linux CI runners (e.g., GitHub Actions `ubuntu-latest`). Platform-specific security frameworks (like `Security.framework` on macOS/iOS) are unavailable on Linux.

**Requirement:** Abstract your storage layer behind a protocol/interface.

- **Production:** Inject the concrete secure storage implementation.
- **Linux/CI:** Detect the platform (e.g., `#if os(Linux)`) and inject an **In-Memory** or **No-Op** storage implementation.
- **Do not** simply skip tests. Verify the SDK logic using the in-memory fallback to ensure behavior (identity persistence, queueing) remains correct even without the native secure container.

### Phase 7: Tracking Consent

**Web and mobile tiers only.**

Four states defined by the `TrackingConsentState` type (see [CONSTANTS.md](CONSTANTS.md)):

| State       | Behavior                                           |
| ----------- | -------------------------------------------------- |
| `granted`   | Send events immediately                            |
| `pending`   | Queue events, flush when consent becomes `granted` |
| `dismissed` | Queue events (same as `pending`)                   |
| `denied`    | Drop events, clear queue                           |

Consent is set at init via `trackingConsent` config and changeable at runtime via `configure({ trackingConsent })`. Persist consent state in storage.

### Phase 8: Event Queue and Pre-Init Buffering

**Web and mobile tiers only.**

Two queuing scenarios:

1. **Pre-init queue**: `track()`, `identify()`, `alias()`, `page()`, `updateTraits()` called before `init()`. Buffer as commands, replay on init.
2. **Consent queue**: Events generated while consent is `pending`/`dismissed`. Buffer as fully-built payloads, flush when consent becomes `granted`.

Queue capacity: `MAX_QUEUE_SIZE` (see [CONSTANTS.md](CONSTANTS.md)). Drop oldest on overflow with a warning.

For pre-init `track`/`page` calls, capture runtime context (timestamp, URL, viewport, referrer) at call time, not at replay time.

### Phase 9: Auto-Capture

**Web tier only.**

When `autoCapture: true`:

1. Track initial pageview on init.
2. Poll URL every `AUTO_CAPTURE_INTERVAL_MS` to detect SPA navigation (see [CONSTANTS.md](CONSTANTS.md)).
3. Listen for `popstate` and `hashchange` events.
4. On URL change: update referrer to previous URL, fire `EVENT_PAGEVIEW` event.

`EVENT_PAGEVIEW` properties: `PROPERTY_URL`, `PROPERTY_VIEWPORT`, `PROPERTY_REFERER`, plus extracted URL search params (see [CONSTANTS.md](CONSTANTS.md) for constant values).

`init()` returns a cleanup function that removes listeners and stops polling.

`configure({ autoCapture })` toggles auto-capture at runtime.

### Phase 10: Endpoint Methods

**All tiers.**

#### `track`

**Web/mobile**: `track(event, properties?, options?)`

`options` (web/mobile, all optional, use named/keyword arguments):

- `timestamp` — ISO 8601 string or Unix epoch integer (seconds); defaults to current time

**Server**: `track(event, distinct_id, options?)`

`options` (server, all optional, use named/keyword arguments):

- `properties` — event properties dict/object
- `anonymous_id` — pass when forwarding client-side identity context
- `device_id` — pass when forwarding client-side identity context
- `timestamp` — ISO 8601 string or Unix epoch integer (seconds); defaults to current time

- `POST /track`
- Attach context: `environment`, `device_id`, `distinct_id`, `anonymous_id`, `session_id`, `timestamp`.
- `timestamp` is an optional ISO 8601 string or Unix epoch integer (seconds). If omitted, default to the current time as an ISO 8601 string.
- Merge system properties (`PROPERTY_LIB`, `PROPERTY_LIB_VERSION`, `PROPERTY_RELEASE`, `PROPERTY_URL`) with user properties. User properties win on conflict. See [CONSTANTS.md](CONSTANTS.md) for key values.
- Renew session before sending (web/mobile).
- **Server tier**: `distinct_id` is required (no stored identity). `anonymous_id` and `device_id` are optional — pass them when you have them (e.g. forwarded from a client SDK), omit otherwise. `session_id` is never included (stateless).

#### `identify`

**Web/mobile**: `identify(user_id, traits?, options?)`

`options` (web/mobile, all optional, use named/keyword arguments):

- `timestamp` — ISO 8601 string or Unix epoch integer (seconds); defaults to current time

**Server**: `identify(user_id, options?)`

`options` (server, all optional, use named/keyword arguments):

- `traits` — user traits dict/object
- `anonymous_id` — pass when forwarding client-side identity context
- `device_id` — pass when forwarding client-side identity context
- `timestamp` — ISO 8601 string or Unix epoch integer (seconds); defaults to current time

- `POST /identify`
- Transition identity state (web/mobile) or pass IDs explicitly (server).
- `timestamp` is an optional ISO 8601 string or Unix epoch integer (seconds). If omitted, default to the current time as an ISO 8601 string.
- Payload excludes `session_id`.
- **Server tier**: `user_id` becomes `distinct_id` in the payload. `anonymous_id` and `device_id` are optional — supply them when forwarding client-side identity context.

#### `alias`

**Web/mobile**: `alias(new_user_id, options?)`

`options` (web/mobile, all optional, use named/keyword arguments):

- `timestamp` — ISO 8601 string or Unix epoch integer (seconds); defaults to current time

**Server**: `alias(distinct_id, new_user_id, options?)`

`options` (server, all optional, use named/keyword arguments):

- `timestamp` — ISO 8601 string or Unix epoch integer (seconds); defaults to current time

- `POST /alias`
- Links `distinct_id` → `new_user_id`.
- `timestamp` is an optional ISO 8601 string or Unix epoch integer (seconds). If omitted, default to the current time as an ISO 8601 string.
- **Server tier**: `distinct_id` is required as the first argument because there is no stored `distinct_id` to link from. It maps directly to `distinct_id` in the payload.

#### `page(url)` — web tier only

- Fires `$pageview` track event with parsed URL properties.

#### `updateTraits(traits)` — web/mobile tiers

- Sends an identify call with new traits. Requires prior `identify()`.

#### `reset(options)` — web/mobile tiers

- Clears session, generates new anonymous identity.
- `resetDeviceId: true` also regenerates device ID.
- Clears the event queue.

#### `configure(updates)` — web/mobile tiers

- Updates config at runtime: `autoCapture`, `persistence`, `trackingConsent`.

#### `getTrackingConsent()` — web/mobile tiers

- Returns current consent state.

### Request/Response Examples

All endpoints accept JSON. Web tier sends the API key as a query param; server tier uses the `X-API-Key` header.

#### `POST /track?apiKey=pk_live_abc123`

```json
{
  "timestamp": "2025-06-15T14:30:00.000Z",
  "event": "checkout_completed",
  "environment": "production",
  "device_id": "device-550e8400-e29b-41d4-a716-446655440000",
  "distinct_id": "user-42",
  "anonymous_id": "anonymous-7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "session_id": "session-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "properties": {
    "$lib": "altertable-js",
    "$lib_version": "0.3.0",
    "$url": "https://example.com/checkout",
    "order_total": 99.99
  }
}
```

#### `POST /identify?apiKey=pk_live_abc123`

No `session_id` in the payload.

```json
{
  "timestamp": "2025-06-15T14:30:00.000Z",
  "environment": "production",
  "device_id": "device-550e8400-e29b-41d4-a716-446655440000",
  "distinct_id": "user-42",
  "anonymous_id": "anonymous-7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "traits": {
    "email": "user@example.com"
  }
}
```

#### `POST /alias?apiKey=pk_live_abc123`

```json
{
  "timestamp": "2025-06-15T14:30:00.000Z",
  "environment": "production",
  "device_id": "device-550e8400-e29b-41d4-a716-446655440000",
  "distinct_id": "anonymous-7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "anonymous_id": null,
  "new_user_id": "user-42"
}
```

#### Error response (422)

```json
{
  "error": "environment-not-found",
  "message": "Environment 'staging' not found for this project.",
  "details": {}
}
```

### Phase 11: Transport

**All tiers.**

**For HTTP client performance best practices**, including keep-alive, timeout defaults, and language-specific HTTP client recommendations, read and follow the [HTTP transport spec](../http/SPEC.md).

#### Web tier

1. Prefer `navigator.sendBeacon` (fire-and-forget, survives page unload).
2. Fallback to `fetch` with `keepalive: true`.
3. Request timeout: `REQUEST_TIMEOUT_MS` (see [CONSTANTS.md](CONSTANTS.md)).
4. API key sent as query param: `?apiKey={key}`.

#### Mobile tier

1. Support background flush on app backgrounding.
2. Request timeout: `MOBILE_REQUEST_TIMEOUT_MS` (see [CONSTANTS.md](CONSTANTS.md)).

#### Server tier

1. API key sent via `X-API-Key` header.
2. Support batch payloads natively.

### Phase 12: Error Model

**All tiers.**

Implement typed errors:

- `AltertableError` — base class
- `ApiError` — HTTP error with `status`, `statusText`, `errorCode`, `details`, request context
- `NetworkError` — connection/timeout failures with `cause`

Type guards: `isAltertableError()`, `isApiError()`, `isNetworkError()`.

`onError` config callback receives SDK errors. Never let SDK errors crash the host application.

Handle `environment-not-found` error specifically: log a warning with a link to the dashboard.

### Phase 13: Testing

**All tiers.**

Implement the mandatory test scenarios defined in [`TEST_PLAN.md`](TEST_PLAN.md).

Furthermore, verify serialized request payloads against the shared JSON fixtures in `fixtures/`.

#### Unit tests

- **Shared Fixtures Compliance:** Load standard JSON fixtures (track, identify, alias) and assert that your SDK produces the exact same JSON payload for the given inputs.
- Model serialization round-trips
- Identity state transitions (anonymous → identified → reset → re-identify)
- Reserved user ID validation
- Pre-init queue replay (web/mobile)
- Consent state machine (granted/denied/pending/dismissed)
- Session renewal logic
- Storage backends and fallback chain (web)
- Auto-capture URL change detection (web)
- Transport selection (beacon vs fetch) (web)
- Request construction and URL encoding
- Error handling and `onError` callback
- Queue overflow behavior

#### Integration tests — run against `ghcr.io/altertable-ai/altertable-mock:latest`

The mock server speaks the full Altertable Product Analytics API. The API key is configured via the `ALTERTABLE_MOCK_API_KEY` environment variable, server listens on port `15001`.

Use a **dual-mode** approach so tests always run — both locally and in CI — without real credentials:

**In CI (GitHub Actions):** declare the mock as a service container so it is pre-bound to `localhost:15001` before the test step starts:

```yaml
services:
  altertable:
    image: ghcr.io/altertable-ai/altertable-mock:latest
    ports:
      - 15001:15001
    env:
      ALTERTABLE_MOCK_API_KEY: test_pk_abc123
    options: >-
      --health-cmd "exit 0"
      --health-interval 5s
      --health-timeout 3s
      --health-retries 3
      --health-start-period 10s
```

**Outside CI (local development):** use the language-native Testcontainers library to pull and start the mock automatically before the test suite, store the mapped port in an environment variable (e.g. `ALTERTABLE_MOCK_PORT`), and stop the container via an `at_exit` / teardown hook. Skip this step when the `CI` environment variable is set.

The test base URL is always `http://localhost:${ALTERTABLE_MOCK_PORT:-15001}`. Point every test client instance at this URL.

Cover at minimum:

- one `track` call verifying the response shape
- one `identify` call verifying the response shape
- one `alias` call verifying the response shape
- one call with an invalid API key verifying a `401` error response
- one call with an invalid environment verifying an `environment-not-found` error response

CI should always run lint + typecheck + unit + integration tests (mock-backed). No test should be skipped due to missing credentials.

### Phase 14: Example App

**Web and mobile tiers only.**

Include a runnable mini-app in the `Examples/` directory (or language-idiomatic equivalent) that demonstrates a complete user journey. This example serves as both a manual test bench and a reference for developers.

The example must match the user journey and API coverage of the [React reference implementation](https://github.com/altertable-ai/altertable-js/tree/main/examples/example-react/src):

1. **Multi-step Signup Funnel**: A minimum 3-step form (e.g., Personal Info, Account Setup, Plan Selection).
2. **Event Tracking**:
   - Track `Step Viewed` on each step.
   - Track transition events (e.g., `Personal Info Completed`, `Account Setup Completed`).
   - Track interaction events (e.g., `Plan Selected`, `Terms Agreement Changed`).
3. **Identity Management**:
   - On the final step, call `identify(user_id, traits)` with the collected information.
   - Track `Form Submitted` immediately after identification.
4. **State Persistence**: Verify that the SDK maintains state across step transitions.

For mobile SDKs, this should be a simple SwiftUI (iOS) or Jetpack Compose (Android) app. For web-framework wrappers, it should be a minimal project using that framework.

### Packaging requirements

1. README must include examples for all endpoints (`track`, `identify`, `alias`, `page`).
2. For web tier: export `TrackingConsent` constants for consumer use.

## Acceptance Checklist

- [ ] `track`, `identify`, `alias` endpoints implemented
- [ ] Identity model (anonymous → identified → alias → reset) correct per tier
- [ ] Session management works with TTL renewal (web/mobile)
- [ ] Storage persistence with fallback chain (web/mobile)
- [ ] Tracking consent state machine (web/mobile)
- [ ] Pre-init queue with runtime context capture (web/mobile)
- [ ] Auto-capture with cleanup (web)
- [ ] Typed errors with `onError` hook
- [ ] Reserved user ID validation
- [ ] Tests cover all tier-relevant behavior (mock-backed integration tests run in both CI and local dev)
- [ ] Runnable example app matching the React reference journey (web/mobile)
- [ ] Package is publish-ready
- [ ] MIT license and docs present
