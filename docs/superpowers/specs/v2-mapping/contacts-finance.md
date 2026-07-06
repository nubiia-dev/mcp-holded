# v1 → v2 Endpoint Mapping: Contacts & Finance-Adjacent Resources

**Generated:** 2026-07-06
**Repo:** mcp-holded
**Scope:** contacts.ts, contact-groups.ts, payments.ts, taxes.ts, services.ts, sales-channels.ts, numbering-series.ts, expenses-accounts.ts, remittances.ts, treasuries.ts
**V1 reference files:** `/src/tools/` directory
**V2 reference pages:** holded.com/es/desarrolladores/referencia-api/ — each route verified on its individual section page.

---

## How to Read This Document

- **V1 base URL:** `https://api.holded.com/api/holded/v1`
- **V2 base URL:** `https://api.holded.com/api/v2`
- Routes in mapping tables are **path-only** (no base URL prefix).
- Status legend: ✅ mapped & verified | ⚠️ mapped but breaking change noted | ❌ no equivalent | 🔍 unverified

---

## 1. Contacts (`contacts.ts`)

**V1 base path:** `/contacts`
**V2 base path:** `/api/v2/contacts`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/contactos/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_contacts` | GET | `/contacts` | GET | `/api/v2/contacts` | ✅ | V1 filters: phone/mobile/customId. V2 filters: customer/supplier/email. See pagination note below. |
| `create_contact` | POST | `/contacts` | POST | `/api/v2/contacts` | ✅ | |
| `get_contact` | GET | `/contacts/{contactId}` | GET | `/api/v2/contacts/{contactId}` | ✅ | |
| `update_contact` | PUT | `/contacts/{contactId}` | PUT | `/api/v2/contacts/{contactId}` | ✅ | |
| `delete_contact` | DELETE | `/contacts/{contactId}` | DELETE | `/api/v2/contacts/{contactId}` | ✅ | |
| `list_contact_attachments` | GET | `/contacts/{contactId}/attachments` | GET | `/api/v2/contacts/{contactId}/attachments` | ✅ | |
| `get_contact_attachment` | GET | `/contacts/{contactId}/attachments/{attachmentId}` | GET | `/api/v2/contacts/{contactId}/attachments/{filename}` | ⚠️ | **BREAKING:** path param changed from `{attachmentId}` (numeric/UUID ID) to `{filename}` (string). V2 list response returns filenames; use those to fetch individual attachments. |

### Attachment Handling in V2

V2 adds an **upload** endpoint missing from V1:

| V2 Method | V2 Verified Route | Description |
|---|---|---|
| POST | `/api/v2/contacts/{contactId}/attachments` | Upload a file attachment to a contact |

The `get_contact_attachment` path parameter change (`{attachmentId}` → `{filename}`) is a silent breaking change: V1 code that passes a numeric ID will produce a 404 or wrong file in V2.

### V2-Only Capabilities (net-new, no V1 equivalent)

| V2 Method | V2 Verified Route | Description |
|---|---|---|
| GET | `/api/v2/contacts/search` | Search contacts by name |
| GET | `/api/v2/contacts/{contactId}/portal-link` | Generate customer portal access link |
| POST | `/api/v2/contacts/bulk-archive` | Archive multiple contacts at once |
| POST | `/api/v2/contacts/bulk-delete` | Delete multiple contacts at once |

### Contact Schema Notes

- V2 contacts support tag associations (see §3 Tags — new resource).
- V1 allowed filtering by `phone`, `mobile`, `customId`; V2 filters by `customer`, `supplier`, `email`. The `customId` filter is likely dropped — verify against actual V2 query param schema.
- V2 permission scopes: `contacts:contacts.read` / `contacts:contacts.write`.

---

## 2. Contact Groups (`contact-groups.ts`)

**V1 base path:** `/contactgroups`
**V2 base path:** `/api/v2/contact-groups`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/grupos-de-contactos/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_contact_groups` | GET | `/contactgroups` | GET | `/api/v2/contact-groups` | ✅ | Slug change: `contactgroups` → `contact-groups` (kebab-case) |
| `create_contact_group` | POST | `/contactgroups` | POST | `/api/v2/contact-groups` | ✅ | |
| `get_contact_group` | GET | `/contactgroups/{groupId}` | GET | `/api/v2/contact-groups/{contactGroupId}` | ✅ | |
| `update_contact_group` | PUT | `/contactgroups/{groupId}` | PUT | `/api/v2/contact-groups/{contactGroupId}` | ✅ | |
| `delete_contact_group` | DELETE | `/contactgroups/{groupId}` | DELETE | `/api/v2/contact-groups/{contactGroupId}` | ✅ | |

### Notes

Full 1:1 operation parity. Only change is URL slug normalization to kebab-case.

---

## 3. Tags / Etiquetas (V2-ONLY — no V1 source file)

**V1 base path:** N/A (no v1 equivalent)
**V2 base path:** `/api/v2/tags`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/etiquetas/

This resource is entirely new in V2. No migration needed — only addition of new tools.

| V2 Method | V2 Verified Route | Description | Permission |
|---|---|---|---|
| POST | `/api/v2/tags` | Create a tag | `account:tags.write` |
| GET | `/api/v2/tags` | List all tags | `account:tags.read` |
| DELETE | `/api/v2/tags/{tag}` | Delete a tag | `account:tags.write` |

### Notes

- No GET single or UPDATE operations — tags are create/list/delete only.
- Tags can be associated with contacts in V2; the `/api/v2/tags` resource must be scaffolded before contact tagging can be used.

---

## 4. Payments (`payments.ts`)

**V1 base path:** `/payments`
**V2 base path:** `/api/v2/payments`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/pagos/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_payments` | GET | `/payments` | GET | `/api/v2/payments` | ✅ | V1: filtered to active fiscal year + date range. V2 filter params unconfirmed — verify query schema. |
| `create_payment` | POST | `/payments` | POST | `/api/v2/payments` | ✅ | |
| `get_payment` | GET | `/payments/{paymentId}` | GET | `/api/v2/payments/{paymentId}` | ✅ | |
| `update_payment` | PUT | `/payments/{paymentId}` | PUT | `/api/v2/payments/{paymentId}` | ✅ | V1 used a read-then-merge workaround to avoid blanking fields on PUT. Check if V2 supports partial updates or requires same approach. |
| `delete_payment` | DELETE | `/payments/{paymentId}` | DELETE | `/api/v2/payments/{paymentId}` | ✅ | |

### V2-Only: Payment Methods (separate resource)

V2 splits payment method configuration into a dedicated resource at `/api/v2/payment-methods`. This was not clearly separated in V1 (V1 `/payments` served both records and configuration).

| V2 Method | V2 Verified Route | Description | Permission |
|---|---|---|---|
| POST | `/api/v2/payment-methods` | Create payment method | `sales:invoicing-settings.write` |
| PUT | `/api/v2/payment-methods/{paymentMethodId}` | Update payment method | `sales:invoicing-settings.write` |
| GET | `/api/v2/payment-methods` | List payment methods | `sales:invoicing-settings.read` |
| GET | `/api/v2/payment-methods/{paymentMethodId}` | Get payment method | `sales:invoicing-settings.read` |
| DELETE | `/api/v2/payment-methods/{paymentMethodId}` | Delete payment method | `sales:invoicing-settings.write` |

### Notes

- V2 permission scope for payment records: `accounting:payments.read` / `accounting:payments.write`.
- Payment methods use a different scope: `sales:invoicing-settings.*` — requires separate OAuth grant.

---

## 5. Taxes (`taxes.ts`)

**V1 base path:** `/taxes`
**V2 base path:** `/api/v2/taxes`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/impuestos/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `get_taxes` | GET | `/taxes` | GET | `/api/v2/taxes` | ✅ | Read-only list preserved in V2. |

### V2-Only Capability

| V2 Method | V2 Verified Route | Description | Permission |
|---|---|---|---|
| GET | `/api/v2/taxes/keys-by-country` | Retrieve tax keys by country and section | `accounting:taxes.read` |

### Notes

- V1 response fields: `key`, `name`, `amount`, `scope`, `group`, `type`. Verify these field names are preserved in V2 response schema — no rename risk identified but unconfirmed.
- V1 was read-only (no create/update/delete). V2 maintains read-only.
- `keys-by-country` enables multi-jurisdiction tax support — significant for cross-border VAT configurations.

---

## 6. Services (`services.ts`)

**V1 base path:** `/services`
**V2 base path:** `/api/v2/services`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/servicios/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_services` | GET | `/services` | GET | `/api/v2/services` | ✅ | |
| `create_service` | POST | `/services` | POST | `/api/v2/services` | ✅ | |
| `get_service` | GET | `/services/{serviceId}` | GET | `/api/v2/services/{serviceId}` | ✅ | |
| `update_service` | PUT | `/services/{serviceId}` | PUT | `/api/v2/services/{serviceId}` | ✅ | |
| `delete_service` | DELETE | `/services/{serviceId}` | DELETE | `/api/v2/services/{serviceId}` | ✅ | |

### Notes

Full 1:1 parity. Route slug unchanged (`/services`). Lowest-risk migration in this batch.

---

## 7. Sales Channels (`sales-channels.ts`)

**V1 base path:** `/saleschannels`
**V2 base path:** `/api/v2/sales-channels`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/canales-de-venta/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_sales_channels` | GET | `/saleschannels` | GET | `/api/v2/sales-channels` | ✅ | Slug: `saleschannels` → `sales-channels` |
| `create_sales_channel` | POST | `/saleschannels` | POST | `/api/v2/sales-channels` | ✅ | |
| `get_sales_channel` | GET | `/saleschannels/{channelId}` | GET | `/api/v2/sales-channels/{salesChannelId}` | ✅ | |
| `update_sales_channel` | PUT | `/saleschannels/{channelId}` | PUT | `/api/v2/sales-channels/{salesChannelId}` | ✅ | |
| `delete_sales_channel` | DELETE | `/saleschannels/{channelId}` | DELETE | `/api/v2/sales-channels/{salesChannelId}` | ✅ | |

### Notes

Full operation parity. Only change is URL normalization to kebab-case.

---

## 8. Numbering Series (`numbering-series.ts`)

**V1 base path:** `/numberseries/{docType}`
**V2 base path:** `/api/v2/numbering-series/{type}`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/series-de-numeracion/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `get_numbering_series` | GET | `/numberseries/{docType}` | GET | `/api/v2/numbering-series/{type}` | ✅ | Slug: `numberseries` → `numbering-series`; param: `{docType}` → `{type}` |
| `create_numbering_serie` | POST | `/numberseries/{docType}` | POST | `/api/v2/numbering-series/{type}` | ✅ | |
| `update_numbering_serie` | PUT | `/numberseries/{docType}/{serieId}` | PUT | `/api/v2/numbering-series/{type}/{numberingSeriesId}` | ✅ | |
| `delete_numbering_serie` | DELETE | `/numberseries/{docType}/{serieId}` | DELETE | `/api/v2/numbering-series/{type}/{numberingSeriesId}` | ✅ | |

### Notes

- Neither V1 nor V2 has a GET-single-by-series-ID endpoint (list-by-type is the only read path).
- **Risk:** V2 reference page does not enumerate valid `{type}` values. V1 valid `docType` values: `invoice`, `salesreceipt`, `creditnote`, `receiptnote`, `estimate`, `salesorder`, `waybill`, `proform`, `purchase`, `purchaserefund`, `purchaseorder`. Some of these Spanish/abbreviated values may be renamed in V2. Verify with a live V2 call before migrating.

---

## 9. Expenses Accounts (`expenses-accounts.ts`)

**V1 base path:** `/expensesaccounts`
**V2 base path:** `/api/v2/expenses-accounts`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/cuentas-de-gastos/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_expenses_accounts` | GET | `/expensesaccounts` | GET | `/api/v2/expenses-accounts` | ✅ | Slug: `expensesaccounts` → `expenses-accounts`. V1: only returned PGC group-6. V2 scope unverified. |
| `create_expenses_account` | POST | `/expensesaccounts` | POST | `/api/v2/expenses-accounts` | ✅ | V1 body: `code` = PGC accountNum. Verify field name unchanged in V2. |
| `get_expenses_account` | GET | `/expensesaccounts/{accountId}` | GET | `/api/v2/expenses-accounts/{expensesAccountId}` | ⚠️ | V1 also worked for income (group 7) accounts. V2 endpoint name implies expenses-only scope — income account reads may 404. |
| `update_expenses_account` | PUT | `/expensesaccounts/{accountId}` | PUT | `/api/v2/expenses-accounts/{expensesAccountId}` | ✅ | |
| `delete_expenses_account` | DELETE | `/expensesaccounts/{accountId}` | DELETE | `/api/v2/expenses-accounts/{expensesAccountId}` | ✅ | |

### Notes

- The `get_expenses_account` scope change risk: if any callers use the V1 tool to fetch income (group 7) accounts by Holded ID, those calls will need to migrate to `/api/v2/accounting/accounts` or similar instead.

---

## 10. Remittances (`remittances.ts`)

**V1 base path:** `/remittances`
**V2 base path:** `/api/v2/treasury/remittances`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/remesas/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_remittances` | GET | `/remittances` | GET | `/api/v2/treasury/remittances` | ⚠️ | **Namespace change:** moved from `/remittances` to `/treasury/remittances` in V2. |
| `get_remittance` | GET | `/remittances/{remittanceId}` | GET | `/api/v2/treasury/remittances/{remittanceId}` | ⚠️ | Same namespace change. |

### Notes

- Both operations remain **read-only** in V2 (no create/update/delete in either version).
- The namespace prefix change to `/treasury/remittances` is a breaking URL change — any hardcoded V1 base path will 404.

---

## 11. Treasuries → Bank Accounts (`treasuries.ts` + `treasury-v2.ts`)

**V1 base path:** `/treasury`
**V2 base path:** `/api/v2/treasury/accounts`
**V2 reference:** holded.com/es/desarrolladores/referencia-api/cuentas-bancarias/

| V1 Tool | V1 Method | V1 Route | V2 Method | V2 Verified Route | Status | Notes |
|---|---|---|---|---|---|---|
| `list_treasuries` | GET | `/treasury` | GET | `/api/v2/treasury/accounts` | ✅ | V1 WARNING: `balance` was static opening figure, not live balance. V2 uses cursor pagination. |
| `create_treasury` | POST | `/treasury` | POST | `/api/v2/treasury/accounts` | ✅ | |
| `get_treasury` | GET | `/treasury/{treasuryId}` | GET | `/api/v2/treasury/accounts/{id}` | ✅ | |

### STATUS: Already Migrated

**`treasury-v2.ts` already exists** and fully covers V2 treasury accounts. `treasuries.ts` (V1) is superseded. No action needed for this resource beyond confirming the V1 file is retired.

### V2 Capabilities Added by `treasury-v2.ts` (beyond V1 scope)

| V2 Method | V2 Verified Route | Description |
|---|---|---|
| PUT | `/api/v2/treasury/accounts/{id}` | Update account (missing in V1) |
| DELETE | `/api/v2/treasury/accounts/{id}` | Delete account (missing in V1) |
| POST | `/api/v2/treasury/accounts/{id}/archive` | Archive account (reversible alternative to delete) |
| GET | `/api/v2/treasury/accounts/{id}/bank-movements` | List bank movements (cursor-paginated) |
| POST | `/api/v2/treasury/accounts/{id}/bank-movements` | Create bank movement |
| POST | `/api/v2/treasury/accounts/{id}/bank-movements/{movementId}/reconcile` | Reconcile movement against documents |
| GET | `/api/v2/treasury/accounts/{id}/cash-movements` | List cash movements (cursor-paginated) |
| GET | `/api/v2/treasury/cashflow/invoicing-forecasts` | List cashflow invoicing forecasts |
| POST | `/api/v2/treasury/cashflow/invoicing-forecasts` | Create forecast |
| PUT | `/api/v2/treasury/cashflow/invoicing-forecasts/{id}` | Update forecast |
| DELETE | `/api/v2/treasury/cashflow/invoicing-forecasts/{id}` | Delete forecast |

---

## Cross-Cutting Notes

### Pagination Style Change

| Aspect | V1 | V2 |
|---|---|---|
| Strategy | Virtual client-side pagination over a full server response dump | Cursor-based (confirmed in treasury-v2.ts; expected for all list endpoints) |
| Parameters | `page` / `perPage` applied client-side | `limit` + `cursor` (or `after`) at server level |
| List tool rewrite required? | — | **Yes, all list tools** |

> Memory note: `feedback_double_pagination.md` records that double pagination (server + virtual) is intentional in the V1 implementation. In V2, the server already paginates — the virtual layer must be re-evaluated to avoid double-slicing an already-paginated cursor response.

### URL Slug Normalization Summary

| V1 Slug | V2 Slug | Change Type |
|---|---|---|
| `/contactgroups` | `/contact-groups` | kebab-case |
| `/saleschannels` | `/sales-channels` | kebab-case |
| `/numberseries` | `/numbering-series` | kebab-case |
| `/expensesaccounts` | `/expenses-accounts` | kebab-case |
| `/remittances` | `/treasury/remittances` | namespace relocation |
| `/treasury` | `/treasury/accounts` | sub-resource suffix |

### Authentication / Permission Scopes

V2 uses OAuth scopes with resource-level granularity. Each resource requires its own scope:

| Resource | Read Scope | Write Scope |
|---|---|---|
| Contacts | `contacts:contacts.read` | `contacts:contacts.write` |
| Contact Groups | `contacts:contacts.read` | `contacts:contacts.write` |
| Tags | `account:tags.read` | `account:tags.write` |
| Payments | `accounting:payments.read` | `accounting:payments.write` |
| Payment Methods | `sales:invoicing-settings.read` | `sales:invoicing-settings.write` |
| Taxes | `accounting:taxes.read` | — |
| Services | `sales:services.read` | `sales:services.write` |
| Sales Channels | `sales:sales-channels.read` | `sales:sales-channels.write` |
| Numbering Series | `sales:invoicing-settings.read` | `sales:invoicing-settings.write` |
| Expenses Accounts | `accounting:expenses-accounts.read` | `accounting:expenses-accounts.write` |
| Remittances | `accounting:remittances.read` | — |
| Treasury Accounts | `accounting:banks.read` | `accounting:banks.write` |

V1 used a single API key with no scope granularity. The MCP server must ensure the V2 API token covers all required scopes.

---

## Gaps & Risks

### Top 3 Risks

1. **Attachment path parameter change** (`{attachmentId}` → `{filename}`): The `get_contact_attachment` tool silently breaks — V1 passes a numeric/UUID ID where V2 expects a filename string. The V2 list response must be checked to confirm it returns filename strings, then the tool rewritten to pass filename. Medium-high risk: no runtime error in tool signature, only a wrong path.

2. **Pagination rewrite required across all list tools**: V1 used virtual client-side pagination over full server dumps; V2 uses cursor-based server pagination. All `list_*` tools need reimplementation. The existing double-pagination design (see memory note) needs review — applying virtual slicing to a cursor-paginated response would break page counts and skip records.

3. **Remittances namespace relocation** (`/remittances` → `/treasury/remittances`): A direct base-URL swap will 404 all remittance calls. Not detectable from the old route — must be an explicit migration step.

### Additional Risks

4. **Numbering series `{type}` enum values unverified**: V2 reference page lists no valid type values. V1 values like `salesreceipt`, `receiptnote`, `proform` may be renamed. Verify with a live V2 call before migrating.

5. **Expenses accounts scope change**: V1 `get_expenses_account` worked for income (group 7) accounts; V2 endpoint name implies expenses-only. Any callers fetching income accounts by ID via this tool will receive 404s in V2.

6. **Contact `customId` filter dropped**: V1 supported filtering contacts by `customId`; V2 filters by `customer`/`supplier`/`email`. Integrations relying on external system ID lookups via `customId` will need a new strategy.

7. **Payment v1/v2 semantic split**: Unclear whether V1 `/payments` tools were used for payment records, payment method config, or both. Audit actual usage before deciding which V2 endpoint each tool maps to (`/payments` vs. `/payment-methods`).

### V2-Only Capabilities Not Yet in MCP Tools

| Resource | V2 Endpoint | Capability |
|---|---|---|
| Tags | `GET/POST /api/v2/tags`, `DELETE /api/v2/tags/{tag}` | New label/tag system for contacts |
| Taxes | `GET /api/v2/taxes/keys-by-country` | Multi-jurisdiction tax key lookup |
| Contacts | `POST /api/v2/contacts/{contactId}/attachments` | Attachment upload (V1 was read-only) |
| Contacts | `GET /api/v2/contacts/search` | Name-based contact search |
| Contacts | `GET /api/v2/contacts/{contactId}/portal-link` | Customer portal link generation |
| Contacts | `POST /api/v2/contacts/bulk-archive` | Bulk archive contacts |
| Contacts | `POST /api/v2/contacts/bulk-delete` | Bulk delete contacts |
| Payment Methods | Full CRUD at `/api/v2/payment-methods` | Separate payment method config resource |

---

## Summary Counts

| Resource | V1 Operations | Mapped ✅ | Breaking ⚠️ | No Equivalent ❌ | Unverified 🔍 |
|---|---|---|---|---|---|
| Contacts | 7 | 6 | 1 (attachment path) | 0 | 0 |
| Contact Groups | 5 | 5 | 0 | 0 | 0 |
| Payments | 5 | 5 | 0 | 0 | 0 |
| Taxes | 1 | 1 | 0 | 0 | 0 |
| Services | 5 | 5 | 0 | 0 | 0 |
| Sales Channels | 5 | 5 | 0 | 0 | 0 |
| Numbering Series | 4 | 4 | 0 | 0 | 0 |
| Expenses Accounts | 5 | 4 | 1 (income scope) | 0 | 0 |
| Remittances | 2 | 0 | 2 (namespace) | 0 | 0 |
| Treasuries | 3 | 3 | 0 | 0 | 0 |
| **TOTAL** | **42** | **38** | **4** | **0** | **0** |

All 42 V1 operations have a V2 route identified. Zero operations lack a V2 equivalent. Four carry breaking changes requiring code-level fixes before migration.
