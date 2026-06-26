# Standardized Compliance Test Plan

This document outlines the mandatory test scenarios for all Altertable Product Analytics SDKs. The goal is to ensure consistent behavior across languages and platforms, particularly for edge cases like identity management and queue handling.

Every SDK must implement these scenarios in its test suite. While implementation details (mocks, syntax) will vary by language, the **inputs** and **expected outcomes** must match this specification.

## 1. Identity Management

### Scenario: Identify (First Call)
- **Input:** Call `identify(userId: "user_123")` when no user is currently identified.
- **Expectation:**
  - `userId` is stored in persistent storage.
  - Subsequent events include `userId: "user_123"`.
  - Session ID is generated/maintained.

### Scenario: Identify (Same User)
- **Input:** Call `identify(userId: "user_123")` when `user_123` is already the current user.
- **Expectation:**
  - No-op.
  - No new session is started.
  - No warning logs.

### Scenario: Identify (New User - Identity Shift)
- **Input:** Call `identify(userId: "user_456")` when `user_123` is currently identified.
- **Expectation:**
  - **Log Warning:** SDK should log a warning that the user identity has changed without a `reset()`.
  - **Auto-Reset:** The SDK must automatically call `reset()` internally to clear the old session and traits.
  - **Update:** The new `userId` ("user_456") is stored.
  - **New Session:** A new session ID is generated for the new user.

### Scenario: Alias (Linking)
- **Input:** Call `alias(newId: "user_123")` when anonymousId is "anon_abc".
- **Expectation:**
  - An `alias` event is enqueued with `previousId: "anon_abc"` and `userId: "user_123"`.
  - The stored `userId` is updated to "user_123".

### Scenario: Reset (Logout)
- **Input:** Call `reset()`.
- **Expectation:**
  - `userId` is cleared from storage.
  - `anonymousId` is regenerated (or preserved depending on config, default: regenerate).
  - Session ID is cleared/regenerated.
  - Traits are cleared.

## 2. Event Tracking

### Scenario: Basic Track
- **Input:** Call `track(event: "Button Clicked", properties: { "color": "blue" })`.
- **Expectation:**
  - Event is enqueued.
  - Payload includes:
    - `event`: "Button Clicked"
    - `properties`: { "color": "blue" }
    - `userId`: (current user ID or null)
    - `anonymousId`: (current anonymous ID)
    - `timestamp`: (ISO 8601)
    - `context`: (library info, os, device)

### Scenario: Track with NIL/Null Properties
- **Input:** Call `track(event: "Viewed", properties: null)`.
- **Expectation:**
  - Event is enqueued.
  - `properties` defaults to `{}` (empty object) in the payload, or is omitted if the spec allows, but must not crash.

## 3. Queue & Batching

### Scenario: Offline Queueing
- **Input:**
  1. Disconnect network (mock).
  2. Call `track("Event A")`.
  3. Call `track("Event B")`.
- **Expectation:**
  - Events are stored locally (disk/memory).
  - No network requests are attempted immediately (or they fail gracefully).
  - `queueSize` increases.

### Scenario: Batch Flush
- **Input:**
  1. Queue contains 5 events.
  2. Network is restored.
  3. Flush triggered (manual or auto-timer).
- **Expectation:**
  - Events are batched into a single (or few) HTTP requests.
  - On 200 OK: Events are removed from the queue.
  - On 5xx Error: Events are kept in the queue for retry (with backoff).
  - On 4xx Error (e.g., 400 Bad Request): Events are dropped (to prevent infinite loops) and an error is logged.

## 4. Configuration

### Scenario: Disable Tracking
- **Input:**
  1. Initialize with `enabled: false`.
  2. Call `track("Event A")`.
- **Expectation:**
  - API call returns immediately.
  - No event is enqueued.
  - No network activity.

## 5. System Context

### Scenario: Automatic Context
- **Input:** Any `track` call.
- **Expectation:**
  - Payload `context` object is automatically populated with:
    - `library.name` (e.g., "altertable-swift")
    - `library.version`
    - `os.name`
    - `os.version`
    - `device.manufacturer` (if available)
    - `device.model` (if available)
