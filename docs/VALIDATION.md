# Validation record

Date: 2026-11-03. Package: `@mikiguillamon/n8n-nodes-quipu@0.1.0` (unpublished).

## Automated checks

- Node.js 24.20.0, npm 11.19.0, TypeScript 5.9.3, `@n8n/node-cli` 0.55.4, `n8n-workflow` 2.16.0.
- `npm run check:contract`: public snapshot and generated contract match; 49 source operations.
- `npm run lint`: official node CLI rules, including cloud compatibility, pass.
- `npm test`: 75 passing tests, covering all 48 business paths, parameter rendering, payloads, PATCH omission/null/false/zero semantics, country locators, line replacements, pagination/limits/start page, included resources, pairing, Continue On Fail, fixed origins, redirect suppression, 429 bounds, mutation timeout behavior, PDFs and multipart uploads.
- Independent review identified final-page pagination duplication and missing nullable relationships. Both were reproduced in failing tests, corrected, and verified by the full passing suite.
- Official `@n8n/scan-community-package` local analysis: source files and extracted tarball both passed. This calls the scanner's exported `analyzePackage` function; the registry/provenance verification leg requires an already published package and was not run.
- `npm audit --omit=dev`: zero production vulnerabilities. Development-only n8n tooling has transitive advisories; it is not shipped as package runtime dependencies. Do not use a blind forced major dependency upgrade to silence these reports.
- Tarball inspection checks the compiled node, credentials, contract, metadata and icons. No secrets, node_modules or development dependencies are bundled.

## Native n8n compatibility

A dedicated Docker container loaded the tarball in **n8n 2.46.4**, image digest `sha256:4384b9ff20a78bc1708c35ce7864f84f724611de7801fb36d715998db7c000f1`.

The runtime registered `@mikiguillamon/n8n-nodes-quipu.quipu` and its generated `quipuTool` variant. The editor displayed the Quipu icon and 49 actions: 48 public business operations plus Custom API Request. Invoice creation, repeated line fields, VAT inputs and the OAuth2 credential form were visually inspected. No real credentials were entered and no workflow was executed against a Quipu account.

`scripts/test-native-oauth.cjs` ran against n8n's actual OAuth2 helper and OAuth client with a synthetic local token endpoint. It verified HTTP Basic authentication, mandatory ecommerce scope, the client_credentials grant, reuse, renewal after 401, one refresh for a persistent 401, credential-storage callback invocation with an expiry timestamp, and acquisition error redaction. The credential storage callback and lock service were simulated; this does not claim a live Quipu or distributed-lock test.

The native helper renews after a rejected 401. The node deliberately relies on n8n's credential lifecycle rather than adding a separate pre-expiry timer or token store.

To repeat this compatibility test in a disposable n8n container, install the tarball under `/home/node/.n8n/nodes/node_modules/@mikiguillamon/n8n-nodes-quipu`, copy `scripts/test-native-oauth.cjs` into the container, and run it with Node. `N8N_MODULE_ROOT` and `QUIPU_PACKAGE_ROOT` can override the two test paths; these variables are used only by the test script, never by the shipped node.

## Remaining external checks before public release

- Live Quipu authentication and account access have **not** been tested. They require an authorized client ID, client secret and owner slug. Start with read-only contact/catalog lookups; mutation smoke tests require an explicitly designated test account.
- The public GitHub repository has not been created or confirmed. Configure actual `repository`, `homepage` and `bugs` metadata before publishing; the publish workflow blocks mismatched/missing repository metadata.
- npm Trusted Publishing or a suitable first-release token has not been configured. No version has been published and no n8n verification application has been submitted.
- The CI workflow is prepared, but it has not run on GitHub. The Node 22 CI leg is therefore not claimed as executed locally.
- The advertised peer dependency permits n8n-workflow versions beyond the exact tested environment; compatibility beyond n8n 2.46.4 is not established by this run.
