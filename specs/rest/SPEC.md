# Management REST API Client Specification

This specification covers the Altertable Management REST API — the programmatic interface for managing Altertable resources such as environments, service accounts, connections, databases, and credentials.

Unlike the other specs in this repository, it is **opt-in**: see [Scope](#scope) below.

OpenAPI source of truth: `https://app.altertable.ai/rest/v1/openapi.yaml` (version `v1`).

## Scope

> ⚠️ **This spec is not implemented by default.**

General-purpose Altertable SDKs (Lakehouse, Product Analytics) **must NOT** implement the Management REST API. A `build-*-sdk` run targeting a normal client library should ignore the `rest/` directory entirely.

This API exists to back operational tooling, specifically:

- the **Altertable CLI**, and
- the **Altertable Terraform provider**.

Only implement against this spec when the target project is one of those tools, or a future tool with an explicit need to manage Altertable resources programmatically.

## Source of Truth

The hosted OpenAPI document is authoritative for all endpoints, request/response schemas, parameters, and status codes:

- OpenAPI: `https://app.altertable.ai/rest/v1/openapi.yaml`
- API version: `v1`

This spec intentionally does **not** restate the endpoint contract. Read the OpenAPI document for the precise surface. Everything below frames how to consume it; the OpenAPI document wins on any discrepancy.

## Base URL

```
https://app.altertable.ai/rest/v1
```

All paths in the OpenAPI document are relative to this base.

## Authentication

The Management REST API uses **HTTP Bearer authentication** with a management API key. Every request carries:

```
Authorization: Bearer atm_...
```

Management API keys are prefixed with `atm_`.

> **Note:** This differs from the Lakehouse API, which uses HTTP Basic Auth (see [`../lakehouse/SPEC.md`](../lakehouse/SPEC.md) § Phase 6: Authentication). Do not conflate the two schemes — a Lakehouse Basic Auth credential is **not** valid here, and an `atm_` management key is **not** valid against the Lakehouse API.

Implementation requirements:

- The API key must never appear in logs, error messages, or debug output.
- Resolve the key from explicit configuration first. Consuming tools (CLI, Terraform provider) define their own credential discovery — e.g. config file, environment variable, or provider block — and are responsible for documenting it.

## Resource Surface (non-normative)

The following is an **illustrative orientation only** — the OpenAPI document is authoritative and may add or change resources not reflected here. Use it to understand the shape of the API, not as a contract.

- **Authentication** — `GET /whoami`: identify the authenticated principal and organization.
- **Environments** — retrieve and create environments (addressable by UUID or slug).
- **Service Accounts** — create and delete service accounts.
- **Connections** — CRUD over an environment's data connections.
- **Databases** — CRUD over an environment's databases.
- **Credentials** — create, retrieve, and revoke per-environment credentials for both users and service accounts.

## Transport and Reliability

For HTTP client performance best practices — keep-alive, timeout defaults, and language-specific HTTP client recommendations — read and follow the [HTTP transport spec](../http/SPEC.md).
