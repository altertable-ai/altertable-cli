# HTTP Transport Specification

This specification defines HTTP client performance best practices and language-specific recommendations for building production-grade Altertable SDKs. Consult this spec when implementing HTTP transport layers for Lakehouse or Product Analytics clients.

## Core Principles

### 1. Connection Pooling and Keep-Alive

**Enable HTTP connection keep-alive by default:**

- Reuse TCP connections across multiple HTTP requests
- Reduce latency by avoiding repeated TCP handshakes

### 2. Default Timeouts

**Always set sensible default timeouts:**

- **Connect timeout**: 5 seconds (time to establish TCP connection)
- **Read/response timeout**: 60 seconds (time to receive complete response)

**Document timeout behavior clearly:**

- Explain what each timeout controls
- Provide examples of how to override defaults
- Warn about long-polling or streaming endpoints that may need longer timeouts

**Allow per-request timeout overrides:**

- Some operations may need different timeout characteristics
- Streaming queries may need no read timeout or very long timeouts
- Batch operations may need extended timeouts

## Language-Specific HTTP Client Recommendations

Choose HTTP clients that provide excellent keep-alive support and production-ready reliability.

### Ruby

**Preference order:**

1. **`httpx`** (recommended)

   - HTTP/2 support
   - Excellent connection pooling

2. **`faraday`** (fallback)

   - Adapter pattern for flexibility
   - Rich middleware ecosystem
   - Wide adoption and stability
   - Good connection pooling via adapters

3. **`Net::HTTP`** (last resort)
   - Standard library (no dependencies)
   - Limited connection pooling capabilities
   - Requires more manual configuration

### Python

**Preference order:**

1. **`httpx`** (recommended)

   - Async support (sync API also available)
   - HTTP/2 support
   - Connection pooling built-in
   - Timeout configuration per request

2. **`requests`** (fallback)
   - Ubiquitous and simple API
   - `requests.Session` for connection pooling
   - Wide ecosystem support

### JavaScript/TypeScript

**Preference order:**

1. **`fetch` API** (recommended for Node 18+)

   - Native support with automatic keep-alive
   - Modern promise-based API
   - No dependencies

2. **`undici`** or **`node-fetch`** (for Node <18)

   - `undici`: High-performance, official Node.js fetch implementation
   - `node-fetch`: Polyfill for fetch API

3. **`axios`** (for interceptor patterns)
   - Rich interceptor ecosystem
   - Automatic retries via plugins
   - Wide adoption

### Go

**Recommendation:**

Use `net/http` standard library with a properly configured `http.Client` and custom `Transport`.

### Java

**Preference order:**

1. **`java.net.http.HttpClient`** (recommended for Java 11+)

   - Native HTTP/2 support
   - Connection pooling built-in
   - Modern async API

2. **`OkHttp`** (for Java 8-10 or advanced features)
   - Robust connection pooling
   - Interceptor support
   - Automatic retries
   - Wide adoption

### Rust

**Recommendation:**

Use `reqwest` with connection pooling enabled.

### Swift

**Preference order:**

1. **`URLSession`** with custom configuration (recommended)

   - Native platform support
   - HTTP/2 support
   - Built-in connection pooling

2. **`Alamofire`** (for advanced features)
   - Rich interceptor ecosystem
   - Request/response serialization
   - Automatic retries

### Kotlin

**Preference order:**

1. **`Ktor Client`** (recommended)

   - Multiplatform support (JVM, Android, iOS, JS)
   - Async/coroutine support
   - Connection pooling built-in
   - Plugin-based architecture

2. **`OkHttp`** (fallback for Android/JVM)
   - Industry standard on Android
   - Robust connection pooling
   - Interceptor support
   - Automatic retries

### PHP

**Recommendation:**

Use `Guzzle` with connection pooling configuration.

## Integration with SDK

**When integrating HTTP client into SDK:**

1. **Make the HTTP client configurable:**

   - Allow users to choose from the supported HTTP client
   - Provide sensible defaults
   - Document how to customize the HTTP client

2. **Expose configuration options:**

   - Timeouts (connect, read, total)
   - Connection pool settings
   - Proxy configuration

3. **Document performance characteristics:**
   - Expected request latencies
   - Connection pool sizing guidance
   - When to use custom timeouts
   - Streaming vs. buffered responses

## Acceptance Checklist

Only consider the HTTP transport layer complete when:

- [ ] Connection keep-alive is enabled by default
- [ ] Sensible timeout defaults are configured
- [ ] Timeout and retry behavior is documented
- [ ] Language-appropriate HTTP client is used
