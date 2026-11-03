# Quipu public API coverage baseline

Source: https://quipuapp.github.io/api-v1-docs/openapi.yaml

Retrieved: 2026-11-03. Snapshot SHA-256: `df3d0f5f6b8ea2efaa0efb2d2bcd9ceb5b16a67f8ed6f38736882dd924de8c5a`.

49 operations. Status: implemented; every business operation is exercised by tests/coverage.test.cjs, and token acquisition uses native n8n OAuth2. Live Quipu account validation remains pending.

| Operation ID | Method | Path | Planned handling |
| --- | --- | --- | --- |
| `createAccessToken` | POST | `/oauth/token` | Credential token acquisition |
| `getUser` | GET | `/users/{id}` | Guided resource operation |
| `listContacts` | GET | `/{owner_slug}/contacts` | Guided resource operation |
| `createContact` | POST | `/{owner_slug}/contacts` | Guided resource operation |
| `getContact` | GET | `/{owner_slug}/contacts/{id}` | Guided resource operation |
| `updateContact` | PATCH | `/{owner_slug}/contacts/{id}` | Guided resource operation |
| `deleteContact` | DELETE | `/{owner_slug}/contacts/{id}` | Guided resource operation |
| `listBookEntries` | GET | `/{owner_slug}/book_entries` | Guided resource operation |
| `listInvoices` | GET | `/{owner_slug}/invoices` | Guided resource operation |
| `createInvoice` | POST | `/{owner_slug}/invoices` | Guided resource operation |
| `getInvoice` | GET | `/{owner_slug}/invoices/{id}` | Guided resource operation |
| `updateInvoice` | PATCH | `/{owner_slug}/invoices/{id}` | Guided resource operation |
| `deleteInvoice` | DELETE | `/{owner_slug}/invoices/{id}` | Guided resource operation |
| `downloadInvoicePdf` | GET | `/{owner_slug}/invoices/{id}/download` | Guided resource operation |
| `ephemeralOpenDownloadInvoicePdf` | GET | `/{owner_slug}/invoices/{id}/ephemeral_open_download` | Download PDF: ephemeral-token mode |
| `listSimplifiedInvoices` | GET | `/{owner_slug}/simplified_invoices` | Guided resource operation |
| `createSimplifiedInvoice` | POST | `/{owner_slug}/simplified_invoices` | Guided resource operation |
| `getSimplifiedInvoice` | GET | `/{owner_slug}/simplified_invoices/{id}` | Guided resource operation |
| `updateSimplifiedInvoice` | PATCH | `/{owner_slug}/simplified_invoices/{id}` | Guided resource operation |
| `deleteSimplifiedInvoice` | DELETE | `/{owner_slug}/simplified_invoices/{id}` | Guided resource operation |
| `downloadSimplifiedInvoicePdf` | GET | `/{owner_slug}/simplified_invoices/{id}/download` | Guided resource operation |
| `ephemeralOpenDownloadSimplifiedInvoicePdf` | GET | `/{owner_slug}/simplified_invoices/{id}/ephemeral_open_download` | Download PDF: ephemeral-token mode |
| `listAdditionalIncomes` | GET | `/{owner_slug}/additional_incomes` | Guided resource operation |
| `createAdditionalIncome` | POST | `/{owner_slug}/additional_incomes` | Guided resource operation |
| `getAdditionalIncome` | GET | `/{owner_slug}/additional_incomes/{id}` | Guided resource operation |
| `updateAdditionalIncome` | PATCH | `/{owner_slug}/additional_incomes/{id}` | Guided resource operation |
| `deleteAdditionalIncome` | DELETE | `/{owner_slug}/additional_incomes/{id}` | Guided resource operation |
| `downloadAdditionalIncomePdf` | GET | `/{owner_slug}/additional_incomes/{id}/download` | Guided resource operation |
| `ephemeralOpenDownloadAdditionalIncomePdf` | GET | `/{owner_slug}/additional_incomes/{id}/ephemeral_open_download` | Download PDF: ephemeral-token mode |
| `listPaysheets` | GET | `/{owner_slug}/paysheets` | Guided resource operation |
| `createPaysheet` | POST | `/{owner_slug}/paysheets` | Guided resource operation |
| `getPaysheet` | GET | `/{owner_slug}/paysheets/{id}` | Guided resource operation |
| `updatePaysheet` | PATCH | `/{owner_slug}/paysheets/{id}` | Guided resource operation |
| `deletePaysheet` | DELETE | `/{owner_slug}/paysheets/{id}` | Guided resource operation |
| `listNumberingSeries` | GET | `/{owner_slug}/numbering_series` | Guided resource operation |
| `createNumberingSeries` | POST | `/{owner_slug}/numbering_series` | Guided resource operation |
| `getNumberingSeries` | GET | `/{owner_slug}/numbering_series/{id}` | Guided resource operation |
| `updateNumberingSeries` | PATCH | `/{owner_slug}/numbering_series/{id}` | Guided resource operation |
| `deleteNumberingSeries` | DELETE | `/{owner_slug}/numbering_series/{id}` | Guided resource operation |
| `listAccountingCategories` | GET | `/{owner_slug}/accounting_categories` | Guided resource operation |
| `getAccountingCategory` | GET | `/{owner_slug}/accounting_categories/{id}` | Guided resource operation |
| `listAccountingSubcategories` | GET | `/{owner_slug}/accounting_subcategories` | Guided resource operation |
| `createAccountingSubcategory` | POST | `/{owner_slug}/accounting_subcategories` | Guided resource operation |
| `getAccountingSubcategory` | GET | `/{owner_slug}/accounting_subcategories/{id}` | Guided resource operation |
| `updateAccountingSubcategory` | PATCH | `/{owner_slug}/accounting_subcategories/{id}` | Guided resource operation |
| `deleteAccountingSubcategory` | DELETE | `/{owner_slug}/accounting_subcategories/{id}` | Guided resource operation |
| `createAttachment` | POST | `/{owner_slug}/attachments` | Guided resource operation |
| `getAttachment` | GET | `/{owner_slug}/attachments/{id}` | Guided resource operation |
| `deleteAttachment` | DELETE | `/{owner_slug}/attachments/{id}` | Guided resource operation |

This matrix tracks endpoint coverage only. Implementation must also audit all writable fields, relationships, query parameters, conditional requirements and binary response formats.

Documentation gaps: contacts/bulk is mentioned without an operation contract; ticket CRUD, tax catalogs, owner lists, projects, webhooks, finalization and email delivery have no dedicated public operation in this snapshot.
