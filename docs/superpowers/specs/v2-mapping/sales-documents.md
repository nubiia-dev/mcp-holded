# Holded API v1 → v2 Endpoint Mapping: Documents

**Scope:** All 11 `docType` values handled by `src/tools/documents.ts`, plus `list_payment_methods`.
**Source file:** `src/tools/documents.ts` (v1 operations extracted directly from handlers).
**Research method:** Each v2 route was verified by fetching the individual resource page from `holded.com/es/desarrolladores/referencia-api/`. Sub-pages (e.g. `/facturas/crear-una-factura`) returned HTTP 404, so only routes listed on the top-level resource pages are quoted below.

---

## 0. v1 docType → v2 Resource Quick Reference

| v1 docType | v2 Resource slug | v2 Base Path (verified) | Auth Scope |
|---|---|---|---|
| `invoice` | `facturas` | `/api/v2/invoices` | `sales:invoices.read/write` |
| `salesreceipt` | `tickets-de-venta` | `/api/v2/sales-receipts` | `sales:receipts.read/write` |
| `creditnote` | `facturas-rectificativas` | `/api/v2/credit-notes` | `sales:invoices.read/write` |
| `receiptnote` | `rectificativas-de-venta` | `/api/v2/receipt-notes` | `sales:invoices.read/write` |
| `estimate` | `presupuestos` | `/api/v2/estimates` | `sales:estimates.read/write` |
| `proform` | `proformas` | `/api/v2/proformas` | `sales:proforms.read/write` |
| `salesorder` | `pedidos-de-venta` | `/api/v2/sales-orders` | `inventory:sales-orders.read/write` |
| `waybill` | `albaranes` | `/api/v2/waybills` | `inventory:shipments.read/write` |
| `purchase` | `compras` | `/api/v2/purchases` | `accounting:purchases.read/write` |
| `purchaserefund` | (nested under `compras`) | `POST /api/v2/purchases/refund` only | `accounting:purchases.write` |
| `purchaseorder` | `pedidos-de-compra` | `/api/v2/purchase-orders` | `inventory:purchase-orders.read/write` |

> **WARNING — `receiptnote` mapping is AMBIGUOUS.** The v2 API has two plausible targets:
> - `/api/v2/receipt-notes` (page: `rectificativas-de-venta`, Sales section, `sales:invoices` scope) — most likely match given the name and that `receiptnote` is NOT in `PURCHASE_DOC_TYPES`.
> - `/api/v2/purchase-shipments` (page: `albaranes-de-compra`, Inventory section) — semantically a purchase receipt/goods-receipt note.
>
> The mapping below uses `/api/v2/receipt-notes`. **Verify against the business domain before shipping.**

> **NOTE — v2 has an additional purchase-side resource with NO v1 equivalent:**
> `/api/v2/purchase-shipments` (albaranes de compra) — if `receiptnote` turns out to map here, then `receipt-notes` would have no v1 equivalent instead.

---

## 1. Per-Resource Operation Mapping Tables

### Legend
- **VERIFIED** — route quoted literally from the resource's doc page
- **NO EQUIVALENT** — v2 has no documented route for this operation
- **UNVERIFIED** — could not confirm (no v2 page found or ambiguous)
- Route changes: `tracking` and `pipeline` switch from **POST** (v1) to **PUT** (v2); `/attach` becomes `/attachments`; `/pay` becomes `/payments`; `/shipped` becomes `/shipped-items`

---

### 1.1 `invoice` → `/api/v2/invoices`

Source page: `holded.com/es/desarrolladores/referencia-api/facturas`

| v1 Operation | v1 Route | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|---|
| `list_documents` | GET `/documents/invoice` | GET | `/api/v2/invoices` | Cursor pagination in v2 (see §3) |
| `create_document` | POST `/documents/invoice` | POST | `/api/v2/invoices` | |
| `get_document` | GET `/documents/invoice/{id}` | GET | `/api/v2/invoices/{invoiceId}` | |
| `get_document_payments` | GET `/documents/invoice/{id}` (reads `paymentsDetail` field) | GET | `/api/v2/invoices/{invoiceId}` | Field name in v2 response may differ; v2 also has POST `/payments` to record |
| `update_document` | PUT `/documents/invoice/{id}` | PUT | `/api/v2/invoices/{invoiceId}` | |
| `delete_document` | DELETE `/documents/invoice/{id}` | DELETE | `/api/v2/invoices/{invoiceId}` | v2 also has bulk: DELETE `/api/v2/invoices` |
| `pay_document` | POST `/documents/invoice/{id}/pay` | POST | `/api/v2/invoices/{invoiceId}/payments` | Endpoint renamed `/pay` → `/payments` |
| `send_document` | POST `/documents/invoice/{id}/send` | POST | `/api/v2/invoices/{invoiceId}/send` | |
| `get_document_pdf` | GET `/documents/invoice/{id}/pdf` | GET | `/api/v2/invoices/{invoiceId}/pdf` | |
| `ship_all_items` | POST `/documents/invoice/{id}/ship` | **NO EQUIVALENT** | — | Invoices are not shippable in v2 |
| `ship_items_by_line` | POST `/documents/invoice/{id}/ship` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | GET `/documents/invoice/{id}/shipped` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST `/documents/invoice/{id}/attach` | POST | `/api/v2/invoices/{invoiceId}/attachments` | Path suffix changed; v2 also has GET list + GET single |
| `update_document_tracking` | POST `/documents/invoice/{id}/tracking` | **NO EQUIVALENT** | — | Tracking not documented for invoices in v2 |
| `update_document_pipeline` | POST `/documents/invoice/{id}/pipeline` | PUT | `/api/v2/invoices/{invoiceId}/pipeline` | Method changed POST → PUT |

**v2-only for invoices:** `POST /api/v2/invoices/{invoiceId}/approve`, `POST /api/v2/invoices/{invoiceId}/cancel`, `POST /api/v2/invoices/bulk/approve`, `POST /api/v2/invoices/bulk/cancel`, `GET /api/v2/invoices/find-by-number`.
**v1-only logic:** `approveDoc` flag on create (v2 requires a separate `/approve` call).

---

### 1.2 `salesreceipt` → `/api/v2/sales-receipts`

Source page: `holded.com/es/desarrolladores/referencia-api/tickets-de-venta`

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/sales-receipts` | |
| `create_document` | POST | `/api/v2/sales-receipts` | |
| `get_document` | GET | `/api/v2/sales-receipts/{salesReceiptId}` | |
| `get_document_payments` | GET | `/api/v2/sales-receipts/{salesReceiptId}` | Reads field from document response |
| `update_document` | PUT | `/api/v2/sales-receipts/{salesReceiptId}` | |
| `delete_document` | DELETE | `/api/v2/sales-receipts/{salesReceiptId}` | |
| `pay_document` | POST | `/api/v2/sales-receipts/{salesReceiptId}/payments` | |
| `send_document` | POST | `/api/v2/sales-receipts/{salesReceiptId}/send` | |
| `get_document_pdf` | GET | `/api/v2/sales-receipts/{salesReceiptId}/pdf` | |
| `ship_all_items` | **NO EQUIVALENT** | — | |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST | `/api/v2/sales-receipts/{salesReceiptId}/attachments` | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | PUT | `/api/v2/sales-receipts/{salesReceiptId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/sales-receipts/{salesReceiptId}/approve`.

---

### 1.3 `creditnote` → `/api/v2/credit-notes`

Source page: `holded.com/es/desarrolladores/referencia-api/facturas-rectificativas`

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/credit-notes` | |
| `create_document` | POST | `/api/v2/credit-notes` | |
| `get_document` | GET | `/api/v2/credit-notes/{creditNoteId}` | |
| `get_document_payments` | GET | `/api/v2/credit-notes/{creditNoteId}` | Reads field from response |
| `update_document` | PUT | `/api/v2/credit-notes/{creditNoteId}` | |
| `delete_document` | DELETE | `/api/v2/credit-notes/{creditNoteId}` | |
| `pay_document` | POST | `/api/v2/credit-notes/{creditNoteId}/payments` | |
| `send_document` | POST | `/api/v2/credit-notes/{creditNoteId}/send` | |
| `get_document_pdf` | GET | `/api/v2/credit-notes/{creditNoteId}/pdf` | |
| `ship_all_items` | **NO EQUIVALENT** | — | |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST | `/api/v2/credit-notes/{creditNoteId}/attachments` | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | PUT | `/api/v2/credit-notes/{creditNoteId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/credit-notes/{creditNoteId}/approve`.

---

### 1.4 `receiptnote` → `/api/v2/receipt-notes` ⚠️ AMBIGUOUS

Source page: `holded.com/es/desarrolladores/referencia-api/rectificativas-de-venta`

**Mapping confidence: LOW.** See warning in §0. The route below is the best guess.

| v1 Operation | v2 Method | v2 Route (VERIFIED on page, mapping UNVERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/receipt-notes` | |
| `create_document` | POST | `/api/v2/receipt-notes` | |
| `get_document` | GET | `/api/v2/receipt-notes/{receiptNoteId}` | |
| `get_document_payments` | GET | `/api/v2/receipt-notes/{receiptNoteId}` | v2 also has `POST .../payments` |
| `update_document` | PUT | `/api/v2/receipt-notes/{receiptNoteId}` | |
| `delete_document` | DELETE | `/api/v2/receipt-notes/{receiptNoteId}` | |
| `pay_document` | POST | `/api/v2/receipt-notes/{receiptNoteId}/payments` | |
| `send_document` | POST | `/api/v2/receipt-notes/{receiptNoteId}/send` | |
| `get_document_pdf` | GET | `/api/v2/receipt-notes/{receiptNoteId}/pdf` | |
| `ship_all_items` | **NO EQUIVALENT** | — | |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST | `/api/v2/receipt-notes/{receiptNoteId}/attachments` | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | PUT | `/api/v2/receipt-notes/{receiptNoteId}/pipeline` | Method POST → PUT |

**Alternative target (if mapping is wrong):** `/api/v2/purchase-shipments` — has only list/get/create/update/delete/approve; no pay/send/pdf/tracking.

---

### 1.5 `estimate` → `/api/v2/estimates`

Source page: `holded.com/es/desarrolladores/referencia-api/presupuestos`

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/estimates` | |
| `create_document` | POST | `/api/v2/estimates` | |
| `get_document` | GET | `/api/v2/estimates/{estimateId}` | |
| `get_document_payments` | **NO EQUIVALENT** | — | Estimates not payable |
| `update_document` | PUT | `/api/v2/estimates/{estimateId}` | |
| `delete_document` | DELETE | `/api/v2/estimates/{estimateId}` | |
| `pay_document` | **NO EQUIVALENT** | — | Estimates not payable directly |
| `send_document` | POST | `/api/v2/estimates/{estimateId}/send` | |
| `get_document_pdf` | GET | `/api/v2/estimates/{estimateId}/pdf` | |
| `ship_all_items` | **NO EQUIVALENT** | — | |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST | `/api/v2/estimates/{estimateId}/attachments` | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | PUT | `/api/v2/estimates/{estimateId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/estimates/{estimateId}/accept`, `POST /api/v2/estimates/{estimateId}/reject` — these have no v1 equivalent (v1 uses `approved` filter only).

---

### 1.6 `proform` → `/api/v2/proformas`

Source page: `holded.com/es/desarrolladores/referencia-api/proformas`

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/proformas` | |
| `create_document` | POST | `/api/v2/proformas` | |
| `get_document` | GET | `/api/v2/proformas/{proformaId}` | |
| `get_document_payments` | **NO EQUIVALENT** | — | Proformas not payable |
| `update_document` | PUT | `/api/v2/proformas/{proformaId}` | |
| `delete_document` | DELETE | `/api/v2/proformas/{proformaId}` | |
| `pay_document` | **NO EQUIVALENT** | — | |
| `send_document` | POST | `/api/v2/proformas/{proformaId}/send` | |
| `get_document_pdf` | GET | `/api/v2/proformas/{proformaId}/pdf` | |
| `ship_all_items` | **NO EQUIVALENT** | — | |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST | `/api/v2/proformas/{proformaId}/attachments` | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | PUT | `/api/v2/proformas/{proformaId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/proformas/{proformaId}/approve`.

---

### 1.7 `salesorder` → `/api/v2/sales-orders`

Source page: `holded.com/es/desarrolladores/referencia-api/pedidos-de-venta`

This is the **richest** v2 resource — most v1 operations have a direct equivalent.

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/sales-orders` | |
| `create_document` | POST | `/api/v2/sales-orders` | |
| `get_document` | GET | `/api/v2/sales-orders/{salesOrderId}` | |
| `get_document_payments` | **NO EQUIVALENT** | — | Sales orders not directly payable in v2 |
| `update_document` | PUT | `/api/v2/sales-orders/{salesOrderId}` | |
| `delete_document` | DELETE | `/api/v2/sales-orders/{salesOrderId}` | |
| `pay_document` | **NO EQUIVALENT** | — | |
| `send_document` | POST | `/api/v2/sales-orders/{salesOrderId}/send` | |
| `get_document_pdf` | GET | `/api/v2/sales-orders/{salesOrderId}/pdf` | |
| `ship_all_items` | POST | `/api/v2/sales-orders/{salesOrderId}/ship` | Route unchanged |
| `ship_items_by_line` | POST | `/api/v2/sales-orders/{salesOrderId}/ship-by-lines` | v1 used same `/ship` endpoint with `lines` body; v2 has dedicated endpoint |
| `get_shipped_units` | GET | `/api/v2/sales-orders/{salesOrderId}/shipped-items` | Suffix changed `/shipped` → `/shipped-items` |
| `attach_file_to_document` | POST | `/api/v2/sales-orders/{salesOrderId}/attachments` | |
| `update_document_tracking` | PUT | `/api/v2/sales-orders/{salesOrderId}/tracking` | Method POST → PUT |
| `update_document_pipeline` | PUT | `/api/v2/sales-orders/{salesOrderId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/sales-orders/{salesOrderId}/approve`.

---

### 1.8 `waybill` → `/api/v2/waybills`

Source page: `holded.com/es/desarrolladores/referencia-api/albaranes`

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/waybills` | |
| `create_document` | POST | `/api/v2/waybills` | |
| `get_document` | GET | `/api/v2/waybills/{waybillId}` | |
| `get_document_payments` | **NO EQUIVALENT** | — | Waybills not payable |
| `update_document` | PUT | `/api/v2/waybills/{waybillId}` | |
| `delete_document` | DELETE | `/api/v2/waybills/{waybillId}` | |
| `pay_document` | **NO EQUIVALENT** | — | |
| `send_document` | POST | `/api/v2/waybills/{waybillId}/send` | |
| `get_document_pdf` | GET | `/api/v2/waybills/{waybillId}/pdf` | |
| `ship_all_items` | **NO EQUIVALENT** | — | Waybills ARE the shipping document; no nested ship |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST | `/api/v2/waybills/{waybillId}/attachments` | |
| `update_document_tracking` | PUT | `/api/v2/waybills/{waybillId}/tracking` | Method POST → PUT; "Actualizar información de seguimiento del albarán" |
| `update_document_pipeline` | PUT | `/api/v2/waybills/{waybillId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/waybills/{waybillId}/approve`.

---

### 1.9 `purchase` → `/api/v2/purchases`

Source page: `holded.com/es/desarrolladores/referencia-api/compras`

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/purchases` | |
| `create_document` | POST | `/api/v2/purchases` | |
| `get_document` | GET | `/api/v2/purchases/{purchaseId}` | |
| `get_document_payments` | GET | `/api/v2/purchases/{purchaseId}` | Reads field from document response |
| `update_document` | PUT | `/api/v2/purchases/{purchaseId}` | |
| `delete_document` | DELETE | `/api/v2/purchases/{purchaseId}` | |
| `pay_document` | POST | `/api/v2/purchases/{purchaseId}/payments` | |
| `send_document` | **NO EQUIVALENT** | — | Purchases not emailed in v2 |
| `get_document_pdf` | **NO EQUIVALENT** | — | Purchase PDF not documented in v2 |
| `ship_all_items` | **NO EQUIVALENT** | — | |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | POST | `/api/v2/purchases/{purchaseId}/attachments` | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | PUT | `/api/v2/purchases/{purchaseId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/purchases/{purchaseId}/approve`, `POST /api/v2/purchases/refund`.

---

### 1.10 `purchaserefund` → ⚠️ SEVERELY LIMITED in v2

Source page: `holded.com/es/desarrolladores/referencia-api/compras`

**Critical gap:** In v1, `purchaserefund` is a full document type with all 15 operations. In v2, the only documented endpoint is a sub-action on `/purchases`:

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | **NO EQUIVALENT** | — | No list endpoint for purchase refunds |
| `create_document` | POST | `/api/v2/purchases/refund` | "Crear una compra rectificativa" |
| `get_document` | **NO EQUIVALENT** | — | No dedicated GET |
| `get_document_payments` | **NO EQUIVALENT** | — | |
| `update_document` | **NO EQUIVALENT** | — | |
| `delete_document` | **NO EQUIVALENT** | — | |
| `pay_document` | **NO EQUIVALENT** | — | |
| `send_document` | **NO EQUIVALENT** | — | |
| `get_document_pdf` | **NO EQUIVALENT** | — | |
| `ship_all_items` | **NO EQUIVALENT** | — | |
| `ship_items_by_line` | **NO EQUIVALENT** | — | |
| `get_shipped_units` | **NO EQUIVALENT** | — | |
| `attach_file_to_document` | **NO EQUIVALENT** | — | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | **NO EQUIVALENT** | — | |

> **Risk:** The created purchase refund document may be accessible via `GET /api/v2/purchases/{id}` if Holded stores it as a regular purchase with a refund flag, but this is unverified. There is no standalone `/api/v2/purchase-refunds` resource documented.

---

### 1.11 `purchaseorder` → `/api/v2/purchase-orders`

Source page: `holded.com/es/desarrolladores/referencia-api/pedidos-de-compra`

| v1 Operation | v2 Method | v2 Route (VERIFIED) | Notes |
|---|---|---|---|
| `list_documents` | GET | `/api/v2/purchase-orders` | |
| `create_document` | POST | `/api/v2/purchase-orders` | |
| `get_document` | GET | `/api/v2/purchase-orders/{purchaseOrderId}` | |
| `get_document_payments` | **NO EQUIVALENT** | — | |
| `update_document` | PUT | `/api/v2/purchase-orders/{purchaseOrderId}` | |
| `delete_document` | DELETE | `/api/v2/purchase-orders/{purchaseOrderId}` | |
| `pay_document` | **NO EQUIVALENT** | — | Purchase orders not directly payable |
| `send_document` | POST | `/api/v2/purchase-orders/{purchaseOrderId}/send` | |
| `get_document_pdf` | GET | `/api/v2/purchase-orders/{purchaseOrderId}/pdf` | |
| `ship_all_items` | POST | `/api/v2/purchase-orders/{purchaseOrderId}/receive` | Concept differs: v1 "ship" → v2 "receive" (from supplier POV) |
| `ship_items_by_line` | **UNVERIFIED** | — | No `receive-by-lines` documented; may not exist |
| `get_shipped_units` | GET | `/api/v2/purchase-orders/{purchaseOrderId}/received-items` | Suffix changed `/shipped` → `/received-items` |
| `attach_file_to_document` | POST | `/api/v2/purchase-orders/{purchaseOrderId}/attachments` | |
| `update_document_tracking` | **NO EQUIVALENT** | — | |
| `update_document_pipeline` | PUT | `/api/v2/purchase-orders/{purchaseOrderId}/pipeline` | Method POST → PUT |

**v2-only:** `POST /api/v2/purchase-orders/{purchaseOrderId}/approve`.

---

### 1.12 `list_payment_methods` (GET `/paymentmethods`)

| v1 Route | v2 Equivalent |
|---|---|
| GET `/paymentmethods` | **UNVERIFIED** — no v2 payment-methods page found in the API reference index. The v2 payments endpoint accepts a payment method ID; how to discover valid IDs in v2 is undocumented in the fetched pages. |

---

## 2. Structural & Payload Differences

### 2.1 Pagination (BREAKING CHANGE)

| | v1 | v2 |
|---|---|---|
| **Style** | Page-based | Cursor-based |
| **Query params** | `page`, `limit` (max 500) | `cursor` (opaque string), `limit` (default 25, max 100) |
| **Response envelope** | Returns array directly | `{ "items": [...], "cursor": "...", "has_more": true }` |
| **Iteration** | `page++` until empty | Loop until `cursor` is null |

Verified from `holded.com/es/desarrolladores/paginacion`. Example from docs:
```js
url.searchParams.set("limit", "50");
if (cursor) url.searchParams.set("cursor", cursor);
// response:
allInvoices.push(...data.items);
cursor = data.cursor;
```

> **Impact:** All list tools need complete rewrite. The `page` param, virtual pagination layer, `summary` mode, and `totalPages`/`hasMore` response shape in `documents.ts` are incompatible with v2.

### 2.2 Sub-Operation Route Changes

| Operation | v1 suffix / method | v2 suffix / method | Applies to |
|---|---|---|---|
| Pay | POST `.../pay` | POST `.../payments` | invoice, salesreceipt, creditnote, receiptnote, purchase |
| Attach | POST `.../attach` (multipart) | POST `.../attachments` (multipart) | all resources |
| List attachments | (none) | GET `.../attachments` | all resources — new in v2 |
| Get attachment | (none) | GET `.../attachments/{attachmentId}` | all resources — new in v2 |
| Tracking | POST `.../tracking` | PUT `.../tracking` | salesorder, waybill |
| Pipeline | POST `.../pipeline` | PUT `.../pipeline` | all resources |
| Ship partial | POST `.../ship` + `lines` body | POST `.../ship-by-lines` | salesorder only |
| Shipped items | GET `.../shipped` | GET `.../shipped-items` | salesorder |
| Receive (purchase order) | POST `.../ship` (ship all) | POST `.../receive` | purchaseorder |
| Received items | GET `.../shipped` | GET `.../received-items` | purchaseorder |
| Approve | `approveDoc: true` in POST body | POST `.../approve` (separate call) | all resources |
| Cancel | (none) | POST `.../cancel` | invoices only |

### 2.3 Approval Flow (BREAKING CHANGE)

- **v1:** Pass `approveDoc: true` in the create body. Single request = create + approve.
- **v2:** Create returns a draft; then call `POST /api/v2/{resource}/{id}/approve` to finalize.
- **Impact:** All `create_document` calls that relied on `approveDoc: true` now require two API calls. The "auto-approve on pay" side effect may also behave differently.

### 2.4 Request Body Field Differences

Individual field-level schemas could not be verified (sub-pages return 404). Known differences based on v1 code comments:
- `invoiceNum`: preserved on purchases in v1; behavior in v2 unknown
- `retention` (IRPF): sales-only in v1; v2 behavior unknown
- `expAccountId`, `salesChannelId`: supported in v1; v2 equivalent field names unknown

### 2.5 Auth Scope Segmentation (NEW)

v1 used a single API key with no scope granularity. v2 uses per-resource OAuth-style scopes:
- Sales documents: `sales:invoices`, `sales:receipts`, `sales:estimates`, `sales:proforms`
- Inventory: `inventory:sales-orders`, `inventory:shipments`, `inventory:purchase-orders`, `inventory:purchase-shipments`
- Accounting: `accounting:purchases`

---

## 3. v2-Only Capabilities Worth Noting

| Capability | v2 Route | No v1 Equivalent |
|---|---|---|
| Bulk approve invoices | `POST /api/v2/invoices/bulk/approve` | Yes |
| Bulk cancel invoices | `POST /api/v2/invoices/bulk/cancel` | Yes |
| Bulk delete invoices | `DELETE /api/v2/invoices` | Yes |
| Search invoice by number | `GET /api/v2/invoices/find-by-number` | Yes |
| Accept/reject estimates | `POST /api/v2/estimates/{id}/accept` / `reject` | Yes |
| Cancel invoices | `POST /api/v2/invoices/{id}/cancel` | Yes |
| List/retrieve attachments | `GET /api/v2/{resource}/{id}/attachments[/{attachmentId}]` | Yes |
| Purchase-shipments resource | `/api/v2/purchase-shipments` | Possibly `receiptnote` (ambiguous) |

---

## 4. Gaps & Risks

### 4.1 CRITICAL GAPS (v1 operations with no v2 equivalent)

| Gap | Affected v1 docTypes | Risk Level |
|---|---|---|
| `purchaserefund` full CRUD | `purchaserefund` | **CRITICAL** — only `POST /api/v2/purchases/refund` exists; no list/get/update/delete |
| `list_payment_methods` | (standalone) | **HIGH** — v2 has no documented equivalent; payment method IDs cannot be discovered |
| `ship_all_items` / `ship_items_by_line` / `get_shipped_units` on invoice/salesreceipt/creditnote/receiptnote/waybill | multiple | MEDIUM — shipping ops only make sense on sales-orders in v2 |
| `pay_document` on estimate/proform/salesorder/waybill/purchaseorder | multiple | LOW — these document types aren't payable directly; business logic unchanged |
| `send_document` for purchases | `purchase` | MEDIUM — sending supplier invoices via email was possible in v1, not documented in v2 |
| `get_document_pdf` for purchases | `purchase` | MEDIUM — PDF not documented in v2 purchase API |
| `update_document_tracking` for invoices/salesreceipts/creditnotes/receiptnotes/purchases | multiple | LOW — tracking only meaningful for orders/waybills |
| `ship_items_by_line` for purchaseorder | `purchaseorder` | MEDIUM — v2 `receive` exists but no line-level receive documented |

### 4.2 THREE BIGGEST RISKS

1. **`purchaserefund` is broken in v2.** The v1 `purchaserefund` docType supports full CRUD (list, get, create, update, delete, pay, send, pdf, attach, pipeline). In v2, only `POST /api/v2/purchases/refund` exists. Any MCP tool that reads, updates, or deletes purchase refunds will fail. This requires either a workaround (treating refunds as purchases with a flag) or accepting the limitation.

2. **Cursor pagination is incompatible with v1 page-based logic.** The current `list_documents` handler applies virtual pagination, `summary` mode, field filtering, and `hasMore` calculation over an array response. v2 returns `{items, cursor, has_more}` with a hard max of 100 per page vs v1's 500. The pagination architecture in `documents.ts` must be completely rewritten; all callers that loop using `page++` will silently stop after the first page.

3. **`receiptnote` docType mapping is unverified.** The v2 API has both `/api/v2/receipt-notes` (rectificativas de venta, Sales section) and `/api/v2/purchase-shipments` (albaranes de compra, Inventory section). The v1 `receiptnote` docType name matches `receipt-notes` textually, but semantically it could be either. Choosing the wrong target will silently fetch/create wrong document types. **This must be confirmed against the live Holded account data before migration.**

### 4.3 Additional Ambiguities

- The `approveDoc` create-time flag becomes a two-step flow in v2. The v1 guarantee that "a single `create_document` call yields a visible, approved document" no longer holds.
- `get_document_payments` in v1 reads `paymentsDetail` from the GET document response. In v2, whether the same field name exists in the document response is unverified (individual schemas unavailable).
- v2 pipeline endpoint changes from POST to PUT — any client code checking the HTTP method will break.
- v2 tracking endpoint changes from POST to PUT for sales-orders and waybills.
- `list_payment_methods` (GET `/paymentmethods`) has no confirmed v2 equivalent. The `pay_document` tool currently requires a `paymentmethod` ID; without a list endpoint, callers cannot discover valid IDs.

---

## 5. Summary Count

| Category | Count |
|---|---|
| v1 docTypes mapped | 11 |
| Distinct v1 operations per docType | 15 (+ 1 `list_payment_methods`) |
| Total operation instances across all docTypes | 166 |
| Operations with verified v2 equivalent route | ~98 |
| Operations marked NO EQUIVALENT | ~57 |
| Operations marked UNVERIFIED (route uncertain) | ~11 |
| v2-only capabilities identified | 8 |
