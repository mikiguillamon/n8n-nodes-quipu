# n8n-nodes-quipu

An n8n community node for Quipu invoicing and accounting. Create and maintain documents with guided fields, select related records from searchable lists, download PDFs, and upload attachments from n8n binary data.

Package: `@mikiguillamon/n8n-nodes-quipu`. This is an independent community integration, not an official Quipu or n8n product.

## Installation

After the package is published, install `@mikiguillamon/n8n-nodes-quipu` through **Settings → Community Nodes** in self-hosted n8n. For a local preview, use `npm run dev` or install the generated `.tgz` in an isolated n8n instance. Public npm publication and n8n verification are separate steps; this package does not claim verification.

Use Node.js `^22.22.0 || >=24.0.0` for development. See [validation evidence](docs/VALIDATION.md) for the n8n version actually tested. The node uses n8n's native OAuth2 and binary helpers and has no third-party runtime dependencies.

## Credentials

1. Obtain a Quipu API **Client ID** and **Client Secret** for the account you want to access.
2. Create a **Quipu OAuth2 API** credential in n8n and enter both values.
3. Enter the account's **Owner Slug**, the account identifier used in Quipu URLs. Do not paste the complete URL. There is no owner-list endpoint in the documented public API.
4. Connect the credential. The node fixes the OAuth grant to client credentials, authenticates the token request using HTTP Basic, and requests the required `ecommerce` scope. n8n stores and renews the tokens.
5. The credential test reads one contact page to check access to the selected account. An invalid slug or missing account permission can fail this test even when the client credentials themselves are valid.

**Owner Slug Override** lets a node access another account already authorized by the same credentials. Never put credentials in workflow parameters, example workflows or source control.

## Operations

The dated public API specification contains **49 operations**: token acquisition handled by credentials and **48 business operations** exposed by the node.

| Resource | Operations |
| --- | --- |
| User | Get |
| Contact | Get Many, Get, Create, Update, Delete |
| Book Entry | Get Many, including supported document types |
| Invoice | Get Many, Get, Create, Update, Delete, Download PDF, Download PDF With Token |
| Simplified Invoice | Get Many, Get, Create, Update, Delete, Download PDF, Download PDF With Token |
| Additional Income | Get Many, Get, Create, Update, Delete, Download PDF, Download PDF With Token |
| Paysheet | Get Many, Get, Create, Update, Delete |
| Numbering Series | Get Many, Get, Create, Update, Delete |
| Accounting Category | Get Many, Get |
| Accounting Subcategory | Get Many, Get, Create, Update, Delete |
| Attachment | Upload, Get, Delete |
| Custom API Request | Advanced relative-path requests to Quipu |

The [coverage matrix](docs/api/coverage.md) records every public operation ID. Guided forms expose the documented writable attributes, relationships and query parameters. Fields the API ignores on update, such as document `kind` and legacy `filing_number`, are not presented as editable update fields.

## Working with the node

### Select records and options

Contacts, documents, numbering series, accounting categories and subcategories offer **From List** and **By ID** modes, with expression support. Lists are paginated; contact, invoice and book-entry search uses the API's search filter. Other searches match the loaded pages locally. A country picker includes two-letter codes and manual code entry.

Numbering series are filtered by document type when the public API supports it; simplified invoices use `tickets` series. Closed-value fields use the published enum values. Quipu does not publish a tax catalog endpoint, so VAT, withholding and discount percentages are editable numbers. Payment method codes and other undocumented value lists remain editable rather than presenting guessed options.

### Create an invoice

1. Select **Invoice → Create**, then choose Income or Expenses.
2. Add the customer or supplier under **Relationships → Contact**. Select a numbering series when appropriate.
3. Enable **Add Line Items**. Add concepts, unit prices and quantities; add VAT, withholding, discount and categories in each row's **Additional Fields**.
4. Add dates and other optional information under **Additional Fields**. Expenses require an issue date. Income documents can start as undated drafts; Quipu applies account-specific numbering and finalization rules.
5. Run the node. The default output contains one item per resulting resource.

The API's `unitary_amount` is a decimal string. A value such as `125.50` is transmitted without rounding it to a JavaScript floating-point price. Percentages and quantities use the types required by the API.

### Update safely

Only fields you add to **Fields to Update** are sent. An untouched field remains absent; `false`, `0` and an empty string are retained. **Clear Fields** explicitly sends `null` for supported nullable fields; do not also supply a value for the same field.

**Replace Line Items** sends the complete replacement list. Existing lines omitted from that list are deleted. Supply an Existing Item ID to update a line in place, and resupply its categories if you want to retain them. An empty replacement list removes every line. Attachment relationships likewise replace the complete list. Changing a category can reset its subcategory unless both are supplied.

**Set Relationships to Null** exposes nullable relationships exactly as documented (the relationship itself is `null`, not an invented `data: null` object). Quipu determines whether a null value removes an existing link; inspect the returned relationship.

Quipu can silently ignore certain changes on finalized, locked or tax-submitted documents even when it returns HTTP 200. The node returns Quipu's actual response; check the resulting document values when these restrictions apply.

### Read multiple records

Use **Get Many**, then **Return All** or **Limit**. **Filters and Options** includes the supported filters, start page, page size and relationship includes for that resource. Page size is at most 100. Filtering and sorting options differ between resources; the node does not invent server capabilities.

**Simplified** output produces one n8n item per resource, including its ID, type, attributes, relationship references and any included data. **Raw JSON:API** produces one response envelope per page, preserving metadata and included resources. When Limit cuts the last page, the raw page's data is trimmed to the requested limit while its server metadata still describes the untrimmed API result set.

### PDFs and attachments

- **Download PDF** writes the response to the configured n8n binary field (default `data`). Downloads are subject to Quipu's document eligibility rules; the invoice download endpoint documents outbound PDFs.
- **Download PDF With Token** uses the token from `ephemeral_open_download_pdf_url`. It does not send the OAuth bearer token. The temporary token is sensitive and expires.
- **Attachment → Upload** takes an incoming binary property and a Book Entry ID, then sends a multipart upload.
- **Attachment → Get** returns metadata and signed file URLs. These URLs expire after ten minutes; get the attachment again for fresh URLs. The node does not send Quipu credentials to storage URLs.

### Advanced requests and AI tools

**Input Mode → JSON** replaces the entire guided mutation body with your JSON:API document. It does not merge it with form fields. Include the correct `data.type`.

**Custom API Request** accepts a relative resource path such as `/your-owner/contacts`, a method, query parameters and an optional JSON body. Paths are restricted to Quipu's fixed origin, redirects are disabled, and OAuth routes cannot be invoked as custom business operations. JSON or PDF responses are available. Custom requests make one request; use guided Get Many operations for automatic pagination.

The action node declares `usableAsTool`. Use limited result counts and specific operations when attaching it to an AI Agent; record-writing and deletion operations have their normal real-world effects.

## Rate limits and errors

Quipu documents **5 requests per 5 seconds**. The node spaces requests by at least 1.1 seconds per credential in one Node.js process and handles bounded 429 retries, honoring reasonable Retry-After values. Independent n8n workers or other applications using the same account can still exceed the shared upstream limit.

Transient 502/503/504 read failures may be retried. Mutation timeouts and ambiguous server failures are not automatically retried, because the original write may already have succeeded. Check Quipu before repeating such a write. **Continue On Fail** returns an item-local error while allowing later input items to run.

## Public API limits

This integration covers the public API, which exposes fewer operations than the Quipu web application. The snapshot does not document:

- Tax, product, project or owner catalog endpoints.
- Standalone ticket CRUD, although tickets appear in book-entry results and numbering series.
- Budget, order or delivery-note CRUD, although these names appear in series applicability values.
- Webhook registration, dedicated finalization, or email-send operations. Updating Last Sent At records a timestamp; it does not send an email.
- A request contract for `/contacts/bulk`, which is mentioned only in descriptive prose. Multiple n8n input items can create contacts individually.

Use Schedule Trigger with Get Many for polling. Fields and relationships without a documented searchable catalog accept IDs. See the [Quipu API reference](https://quipuapp.github.io/api-v1-docs/) for account-specific restrictions, including Verifactu behavior.

## Development

```sh
npm ci
npm run check:contract
npm run lint
npm test
npm pack --dry-run
npm run dev -- --custom-user-folder /tmp/n8n-quipu-dev
```

The public OpenAPI snapshot is checked in under `docs/api/`. `npm run generate:contract` regenerates the runtime contract projection; `npm run check:contract` detects drift. The YAML parser is a development dependency and is not included in the published runtime. Changes to the upstream API require reviewing the forms and adding tests, not just regenerating metadata.

The repository includes importable [example workflows](examples/). Select your own credentials and replace example IDs before executing them.

## Publication

The package is prepared for public npm distribution but is not published by this checkout. A public source repository must be created or selected before the first release; no remote repository is presumed to exist.

See the step-by-step [GitHub and npm setup guide (Spanish)](docs/PUBLISHING.md).

1. Create the public GitHub repository, set `repository`, `homepage` and `bugs` in `package.json` to its actual URLs, and push the source to `main`.
2. After CI passes, publish the initial package interactively with `npm login` and `npm publish --access public` from the committed checkout.
3. Configure npm Trusted Publishing for `publish.yml` with permission to run `npm publish`. No `NPM_TOKEN` secret is needed.
4. Set the GitHub Actions repository variable `NPM_PUBLISH_ENABLED` to `true`. Every subsequent push to `main` validates and publishes a new version with provenance. Manual dispatch on `main` is also supported. Tags do not trigger publishing.
5. Submit for n8n verification separately if desired. Publishing a package does not grant n8n verification.

Automatic releases use the highest published stable npm version plus one patch, unless the source version is newer (an explicit minor/major release). Version changes affect the runner's `package.json` and lockfile only; the workflow does not write commits or tags to the repository. The GitHub Actions summary records the released version and source commit. Re-running an already published commit skips publication when its `gitHead` is present in npm metadata. Publication runs are serialized with up to 100 pending runs; registry errors fail the run instead of guessing a version. Do not run a competing manual publication while an automatic release is in progress.

Do not run `npm publish` until the package contents, account permissions and source metadata have been reviewed. Never commit API credentials or npm tokens.

## License and attribution

MIT. Quipu's name and icon belong to their respective owner. The icon is sourced from the public Quipu API documentation and is used solely to identify the integration. No affiliation or endorsement is implied.
