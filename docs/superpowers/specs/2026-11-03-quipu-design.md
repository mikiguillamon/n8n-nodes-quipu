# Quipu community node — proposed design

Status: approved by the user (Adelante). Service confirmed as Quipu on 2026-11-03.

## Intent

Build a complete, approachable n8n community node for Quipu, with the interaction quality of an official node. Routine operations must use guided fields rather than require JSON. Prepare the package for npm using the author's existing conventions.

The user requires complete API coverage, helpful preloaded options, and publication readiness. Technical choices below are recommendations by the builder, not previously approved decisions.

## Sources and scope baseline

- Public Quipu specification: https://quipuapp.github.io/api-v1-docs/openapi.yaml (retrieved 2026-11-03).
- API reference: https://quipuapp.github.io/api-v1-docs/.
- Official tooling: https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool.
- Verification guidelines: https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.
- Existing local Holded and Solidtime package metadata informs naming and build conventions.

The public specification contains **49 operations**: one authentication operation and 48 business operations. Coverage means implementing every documented public operation, writable field, relationship, filter, include option, and response format. A generic HTTP operation does not count as guided endpoint coverage.

The upstream repository contains material that is filtered from the published specification. Use the published public specification as the contract. Keep an exact dated public snapshot and an operation coverage matrix for reproducibility.

## Approaches

1. **Recommended: modular programmatic TypeScript node.** Shared transport, explicit resource forms, resource lookup methods, binary handling, and isolated JSON:API serializers. More application code than declarative routing, but appropriate for nested line items, precise PATCH semantics, uploads, downloads, and rate limits.
2. **Alternative: declarative HTTP node with custom hooks.** Less request routing code and native n8n routing conventions. The same complex forms and several binary/authentication hooks remain necessary, spreading the special cases across routing and hooks.

A generated generic API wrapper alone does not satisfy the user's requirement for approachable forms. OpenAPI is useful for completeness checks, not a substitute for interface design.

## Package and architecture

- Proposed package: `@mikiguillamon/n8n-nodes-quipu`, initial version `0.1.0`, MIT.
- One action node, `Quipu`, plus Quipu credentials; English interface and public documentation to follow n8n verification requirements.
- Use `@n8n/node-cli` for building, linting, and local development; pin a compatible tested toolchain in the lockfile.
- Source modules: `credentials`, node definition, resource descriptions, `loadOptions`/`listSearch`, transport, pagination/errors, and pure payload/output helpers.
- Use n8n HTTP and binary helpers; no third-party runtime dependencies or runtime filesystem/environment access.
- Prefer native n8n client-credentials OAuth handling if it supports the required Basic token request and scope; otherwise implement the smallest custom credential flow with equivalent tests. The implementer owns this compatibility decision.
- Proposed repository name `mikiguillamon/n8n-nodes-quipu`; verify repository ownership/existence before setting final publishing links or configuring external services.

## Resource coverage

| Resource | Guided operations | Count |
| --- | --- | ---: |
| Authentication | Obtain token internally through credentials | 1 |
| User | Get by ID | 1 |
| Contact | Get many, get, create, update, delete | 5 |
| Book Entry | Get many across supported document types | 1 |
| Invoice | Get many, get, create, update, delete, download PDF, download PDF using ephemeral token | 7 |
| Simplified Invoice | Get many, get, create, update, delete, download PDF, download PDF using ephemeral token | 7 |
| Additional Income | Get many, get, create, update, delete, download PDF, download PDF using ephemeral token | 7 |
| Paysheet | Get many, get, create, update, delete | 5 |
| Numbering Series | Get many, get, create, update, delete | 5 |
| Accounting Category | Get many, get | 2 |
| Accounting Subcategory | Get many, get, create, update, delete | 5 |
| Attachment | Upload binary, get metadata, delete | 3 |

The ephemeral download variants can be exposed as a mode of Download PDF, with both endpoint paths covered and tested. Token acquisition is not a business action returning secrets into workflow output.

Also provide a Custom API Request operation for advanced use, with relative Quipu paths, method, query fields, optional JSON body, and explicit response mode. Restrict requests to the fixed Quipu origin; callers cannot override authorization or redirect credentials to another host. It complements, rather than replaces, the guided operations.

## Credentials and account selection

- Client ID and masked Client Secret; token endpoint `https://getquipu.com/oauth/token`.
- Token requests use HTTP Basic credentials, form-encoded `grant_type=client_credentials`, and mandatory `scope=ecommerce`.
- Token lifetime is documented as 7200 seconds. Reuse tokens, refresh before expiry, isolate cache/state by credential, and do not log tokens or secrets.
- Default owner slug in credentials, overridable on the node for multi-account use. Explain where the slug comes from. No owner-list endpoint is documented, so do not promise automatic account discovery.
- Credential test obtains a token and makes a safe, small account-scoped read to validate the selected owner. Distinguish credential failure from account access failure.
- Ephemeral PDF mode uses the documented token query parameter without sending Bearer authorization; mask its parameter and sanitize errors.

## Forms and options

- Resource then Operation. Show required fields first; group optional fields by purpose. Every documented writable field has a guided representation, including advanced relationships by ID where no lookup endpoint exists.
- Document line items use repeatable rows: concept, unit price, quantity, tax, retention, discount, description, kind, and supported category/subcategory relationships. Preserve decimal unit prices as strings.
- Dynamic searchable selectors for contacts and documents; dynamic lists for numbering series, accounting categories, and subcategories. Apply server filters only where documented, paginate lookup responses, and always allow an explicit ID/expression.
- Filter numbering series by supported document type; simplified invoices use the API's `tickets` series identifier. Keep API relationship names such as `numeration` internal to serialization.
- Derive static selectors from documented enums: income/expenses, document and identity types, payment states, sorting, fiscal reason codes, series applicability, and other closed-value fields. Display explanatory labels without inventing meanings for undocumented codes.
- Quipu exposes no tax-list endpoint in this specification. Tax percentages remain editable numeric inputs; do not label guessed rates as account-specific or authoritative options. Likewise payment method, language and line kind fields lack complete documented enums and must remain editable.
- Country codes should have a friendly selectable standard list plus code entry; only API-documented rules should be enforced locally. Whether to bundle a standards-derived country list or rely on code entry plus suggestions is an implementation decision.
- Add optional JSON body mode for advanced use without forcing it for routine work; make replacement versus merging explicit and deterministic.

## Mutation semantics

- Create validates required data and resource-specific conditions, including expense issue dates, simplified income recipient, and paysheet employee relationship.
- PATCH sends only explicitly selected changes. Omitted, null, empty string, zero and false remain distinct. Nullable fields offer an explicit Clear choice; untouched fields never acquire default values in the request.
- Show an explicit Replace Line Items control. Sending items replaces the entire list; preserve supplied IDs and warn that omitted items are removed. Likewise explain attachment replacement and category/subcategory reset semantics.
- Do not silently calculate fiscal rules or rewrite identity information beyond the documented contract. Surface Quipu validation errors with field names.
- Explain that finalized or locked documents can ignore certain updates even when Quipu returns HTTP 200. Return the server's actual representation rather than claiming all requested values were applied.
- Keep `kind` out of update forms where immutable. Preserve special distinctions such as contact `equivalence_subcharge` versus invoice `equivalence_surcharge` in the transport mapping.
- Contact country inference and schema requirements differ: guided creation requests an explicit country to avoid ambiguity; document advanced mode's documented inference behavior.

## Lists, output and binary data

- Get Many exposes Return All, Limit, applicable filters, ordering, and relationship inclusion. Use `page[number]`, `page[size]` (maximum 100) and `meta.pagination_info` with guards against repeated/non-advancing pages.
- Default output: one n8n item per resource with ID, type, readable attributes, relationships, and requested included resources resolved without losing their identities. Provide a raw JSON:API response mode that preserves page envelopes and metadata.
- Preserve n8n paired-item linkage, multiple input items, and Continue On Fail semantics. Do not discard included records or silently truncate data.
- PDF downloads return an n8n binary property with filename and MIME type, retaining document identifiers in JSON. Upload Attachment reads a chosen incoming binary property and sends multipart `file` and `book_entry_id`.
- Attachment Get returns metadata including the documented signed download URLs; these expire after ten minutes. Do not silently fetch arbitrary URLs or send Quipu credentials to storage hosts.

## Transport, rate limits and errors

- Fixed origin `https://getquipu.com`; documented API version headers for JSON requests; correct separate OAuth, multipart and PDF handling.
- Quipu documents 5 requests per 5 seconds. Pace requests conservatively within a process, coordinate calls by credential where practical, and handle 429 with bounded waits using Retry-After when present. Distributed n8n workers cannot share an in-memory limiter; document the limitation and handle server throttling.
- Limit retries and total waiting. Retry safe reads on transient failures; never blindly retry a potentially accepted mutation after a timeout or ambiguous 5xx. A clear 429 rejection may be retried within the configured bound.
- Refresh expired credentials through the credential mechanism; guard against infinite 401 loops. Token renewal must not turn uncertain mutation outcomes into duplicate documents.
- Translate documented JSON:API and OAuth errors into actionable n8n errors; preserve status and relevant field details while redacting authentication and ephemeral tokens.

## Limits of the public API

- No documented webhook registration endpoints: no webhook trigger in this release. Users can poll with Schedule Trigger and Get Many.
- No public standalone tax, product, project or owner catalog endpoint in this contract. Relationships with no catalog require IDs.
- Tickets appear in book-entry results, filters and series types, but there is no standalone public ticket CRUD path in the current specification.
- Budgets, orders and delivery notes appear as series applicability values, not public CRUD resources.
- `/contacts/bulk` is mentioned in prose but has no path/request contract. Do not invent a guided implementation; record the documentation gap. Multiple n8n input items provide ordinary per-contact creation.
- No documented dedicated finalize, email-send or credit-note creation endpoint. Do not mislabel updating `last_sent_at` as sending an email. Surface supported fields and relationships accurately.
- No claim that npm preparation means n8n has officially verified the node.

## Validation and definition of done

1. Trace every one of the 49 source operations to credential handling or a guided operation and tests. Audit writable fields, filters, include values and relationships separately.
2. Meaningful tests for JSON:API bodies, all resource routes, conditional required fields, omitted/null/false/zero PATCH behavior, replace semantics, enum mapping, list pagination and included data, token acquisition/expiry, 429, error redaction, input pairing, Continue On Fail, binary downloads/uploads and restricted custom requests.
3. Clean TypeScript build, official node lint, tests, and package scanner where available; inspect `npm pack --dry-run` and the actual tarball for compiled node/credential code, metadata and icons.
4. Install/load the tarball in an isolated n8n instance and inspect visible fields, conditional forms, selectors, icon, binary property selection and workflow execution using controlled mocks where appropriate.
5. Live read-only credential and lookup smoke tests require user-provided credentials through a secure mechanism. Live writes require a designated test account and explicit scope; without these, accurately label live API integration as unverified rather than pretending mocks prove it.
6. English README with installation, credentials/owner slug, resource matrix, guided examples, API limitations, throttling, development and release instructions. Include importable example workflows without secrets and a changelog.
7. CI validates lint/build/tests/package. Prepare GitHub Actions publication with provenance, preferring npm Trusted Publishing, and document external setup. Verify final package/repository metadata. Actual public release is outside the user's current request to prepare publication.

## Remaining decisions owned by the builder

Choose exact module layout, test runner, compatible dependency versions, safe output naming, lookup pagination implementation, credential cache mechanism, and local n8n test setup. Record any evidence-backed API or tooling constraint rather than weakening coverage silently.

The proposed programmatic architecture and this scope need one user review before the implementation plan. Credentials and external npm/GitHub setup can be requested later only when needed; they do not block writing and testing the package locally.
