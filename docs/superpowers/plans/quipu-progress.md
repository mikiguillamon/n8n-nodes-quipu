# Execution ledger — plan: 2026-11-03-quipu.md

- Design approved by user: “Adelante”. Implement inline without another approval request.
- Fresh directory has no existing code or Git repository; work in this user-selected project directory without a worktree.
- Task interfaces checked: contract feeds payload/UI/dispatch; shared transport feeds execution and lookup methods. No conflicting interfaces.
- npm registry reports @n8n/node-cli 0.55.4 and n8n-workflow 2.16.0. Proposed npm package returns 404 (not proof of publication rights).

- Task 1: public contract generated and payload tests passed (7 cases); all 49 operation IDs retained.
- Task 2: native OAuth2 with fixed client credentials/header/ecommerce defaults; transport tests passed (7 cases). No custom token storage needed.
- Task 3: all 48 business operations have guided forms; 20 tests pass including field/relationship/query coverage, binary and multi-item execution. Official lint passes.
- Implementation decision: binary upload uses a Buffer multipart body to avoid an external runtime form-data dependency; filename/header boundary behavior is tested.
- npm production audit: 0 vulnerabilities; development toolchain has transitive advisories, kept distinct from shipped package.
- Repository could not be resolved through GitHub. Do not claim it exists; publication instructions will include creating/linking the public source repository.

- Independent review: pagination size shrink reproduced and fixed (Limit150 + start-page regression). Nullable relationships reproduced and fixed with explicit outer null and guided selection. 74 tests pass.
- Additional validation: impossible dates, date arrays, unsupported paysheet per-line relationships all covered RED→GREEN.
- Native n8n 2.46.4 OAuth runtime test passed with synthetic local token server: Basic auth, ecommerce scope, client_credentials, reuse, 401 renewal, bounded refresh, persisted expiry, error redaction. Uses a simulated lock service; no real Quipu request.
- Decision: use n8n's native renewal-on-401 behavior rather than introducing a custom pre-expiry timer; n8n owns encrypted token persistence and refresh coordination. A 401 is a rejected request, not an ambiguous timeout.
- n8n 2.46.4 loaded the tarball as both Quipu and Quipu Tool. Editor shows 49 actions (48 public business operations plus custom request); invoice line fields and credential form inspected visually.

- Task 4: README, examples, MIT license, changelog, CI and provenance publication workflow ready. Actual GitHub/npm setup intentionally remains external, with explicit publish guard.
- Task 5: reviewer findings fixed; no reviewer minor findings deferred. All 75 automated tests pass, official lint and public contract check pass.
- Official scanner exported local analyzePackage: source passed, extracted tarball passed. Registry/provenance verification remains a post-publication check, not claimed.
- Tarball verified: node, OAuth credential, icon assets, codex metadata, contract, examples and validation document included; no node_modules or secrets bundled.
- Final environment: live Quipu API testing unavailable without account credentials. Local fake-token OAuth verification and editor loading are complete.
