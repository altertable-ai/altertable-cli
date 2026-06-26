# SDK Constants Reference

Canonical constant values for the Altertable Product Analytics SDK. Use these exact values when implementing any tier.

## Storage Keys

| Constant               | Value    |
| ---------------------- | -------- |
| `STORAGE_KEY_PREFIX`   | `"atbl"` |
| `STORAGE_KEY_SEPARATOR`| `"."`    |

Storage key format: `atbl.{apiKey}.{environment}`

`STORAGE_KEY_TEST` is built as `atbl.check` — used to verify storage availability.

## ID Prefixes

| Constant              | Value         |
| --------------------- | ------------- |
| `PREFIX_SESSION_ID`   | `"session"`   |
| `PREFIX_ANONYMOUS_ID` | `"anonymous"` |
| `PREFIX_DEVICE_ID`    | `"device"`    |

## Timing and Limits

| Constant                     | Value       | Notes                      |
| ---------------------------- | ----------- | -------------------------- |
| `AUTO_CAPTURE_INTERVAL_MS`   | `100`       | SPA URL polling interval   |
| `SESSION_EXPIRATION_TIME_MS` | `1_800_000` | 30 minutes in milliseconds |
| `MAX_QUEUE_SIZE`             | `1_000`     | Drop oldest on overflow    |
| `REQUEST_TIMEOUT_MS`         | `5_000`     | Web tier HTTP timeout      |

## Event and Property Names

| Constant               | Value            |
| ---------------------- | ---------------- |
| `EVENT_PAGEVIEW`       | `"$pageview"`    |
| `PROPERTY_LIB`         | `"$lib"`         |
| `PROPERTY_LIB_VERSION` | `"$lib_version"` |
| `PROPERTY_REFERER`     | `"$referer"`     |
| `PROPERTY_RELEASE`     | `"$release"`     |
| `PROPERTY_URL`         | `"$url"`         |
| `PROPERTY_VIEWPORT`    | `"$viewport"`    |

## Timing and Limits (Mobile)

| Constant                      | Value   | Notes                      |
| ----------------------------- | ------- | -------------------------- |
| `MOBILE_REQUEST_TIMEOUT_MS`   | `10_000` | Mobile tier HTTP timeout   |

## Config Interfaces and Defaults

### WebConfig

| Option             | Type                      | Default                   | Description                                                                       |
| ------------------ | ------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `apiKey`           | `string`                  | _(required)_              | Public API key (`pk_live_…` or `pk_test_…`)                                       |
| `baseUrl`          | `string`                  | `https://api.altertable.ai` | Override the API base URL                                                       |
| `environment`      | `string`                  | `"production"`            | Analytics environment name                                                        |
| `persistence`      | `"localStorage+cookie" \| "localStorage" \| "sessionStorage" \| "cookie" \| "memory"` | `"localStorage+cookie"` | Storage backend |
| `trackingConsent`  | `TrackingConsentState`    | `"granted"`               | Initial tracking consent state                                                    |
| `autoCapture`      | `boolean`                 | `true`                    | Automatically capture pageviews on SPA navigation                                 |
| `release`          | `string \| null`          | `null`                    | App release/version string attached to every event as `$release`                 |
| `onError`          | `(error: AltertableError) => void \| null` | `null`  | Callback invoked on SDK errors (must not throw)                                   |
| `debug`            | `boolean`                 | `false`                   | Enable verbose console logging                                                    |
| `requestTimeout`   | `number`                  | `REQUEST_TIMEOUT_MS`      | HTTP request timeout in milliseconds                                              |

**`WEB_DEFAULTS`** (canonical values):

```
apiKey:           (none — required)
baseUrl:          "https://api.altertable.ai"
environment:      "production"
persistence:      "localStorage+cookie"
trackingConsent:  "granted"
autoCapture:      true
release:          null
onError:          null
debug:            false
requestTimeout:   5000
```

### MobileConfig

| Option            | Type                   | Default                     | Description                                                        |
| ----------------- | ---------------------- | --------------------------- | ------------------------------------------------------------------ |
| `apiKey`          | `string`               | _(required)_                | Public API key                                                     |
| `baseUrl`         | `string`               | `https://api.altertable.ai` | Override the API base URL                                          |
| `environment`     | `string`               | `"production"`              | Analytics environment name                                         |
| `trackingConsent` | `TrackingConsentState` | `"granted"`                 | Initial tracking consent state                                     |
| `release`         | `string \| null`       | `null`                      | App release/version string attached to every event as `$release`  |
| `onError`         | `(error: AltertableError) => void \| null` | `null` | Callback invoked on SDK errors                               |
| `debug`           | `boolean`              | `false`                     | Enable verbose logging                                             |
| `requestTimeout`  | `number`               | `MOBILE_REQUEST_TIMEOUT_MS` | HTTP request timeout in milliseconds                               |
| `flushOnBackground` | `boolean`            | `true`                      | Flush queued events when app moves to background                   |

**`MOBILE_DEFAULTS`** (canonical values):

```
apiKey:             (none — required)
baseUrl:            "https://api.altertable.ai"
environment:        "production"
trackingConsent:    "granted"
release:            null
onError:            null
debug:              false
requestTimeout:     10000
flushOnBackground:  true
```

### ServerConfig

| Option           | Type                    | Default                     | Description                                                       |
| ---------------- | ----------------------- | --------------------------- | ----------------------------------------------------------------- |
| `apiKey`         | `string`                | _(required)_                | Public API key (`pk_live_…` or `pk_test_…`)                       |
| `baseUrl`        | `string`                | `https://api.altertable.ai` | Override the API base URL                                         |
| `environment`    | `string`                | `"production"`              | Analytics environment name                                        |
| `release`        | `string \| null`        | `null`                      | App release/version string attached to every event as `$release` |
| `onError`        | `(error: AltertableError) => void \| null` | `null` | Callback invoked on SDK errors                              |
| `debug`          | `boolean`               | `false`                     | Enable verbose logging                                            |
| `requestTimeout` | `number`                | `5000`                      | HTTP request timeout in milliseconds                              |
| `maxBatchSize`   | `number`                | `100`                       | Maximum number of events per batch request                        |

**`SERVER_DEFAULTS`** (canonical values):

```
apiKey:         (none — required)
baseUrl:        "https://api.altertable.ai"
environment:    "production"
release:        null
onError:        null
debug:          false
requestTimeout: 5000
maxBatchSize:   100
```

## Tracking Consent States

| Constant                    | Value        | Behavior                         |
| --------------------------- | ------------ | -------------------------------- |
| `TrackingConsent.GRANTED`   | `"granted"`  | Send events immediately          |
| `TrackingConsent.DENIED`    | `"denied"`   | Drop events, clear queue         |
| `TrackingConsent.PENDING`   | `"pending"`  | Queue events                     |
| `TrackingConsent.DISMISSED` | `"dismissed"`| Queue events (same as `pending`) |

## Reserved User IDs

Reject the following IDs. `RESERVED_USER_IDS` is matched case-insensitively; `RESERVED_USER_IDS_CASE_SENSITIVE` is matched exactly.

**`RESERVED_USER_IDS`** (case-insensitive):

```
anonymous_id, anonymous, distinct_id, distinctid, false, guest,
id, not_authenticated, true, undefined, user_id, user,
visitor_id, visitor
```

**`RESERVED_USER_IDS_CASE_SENSITIVE`** (exact match):

```
[object Object], 0, NaN, none, None, null
```
