# Inventory v1 → v2 Endpoint Mapping

> Sources: `src/tools/products.ts`, `src/tools/warehouses.ts` (v1); Holded API Reference pages (v2) — each route verified on individual doc page.
> Base URL v1 (inferred): `https://api.holded.com/api/v1/`
> Base URL v2 (verified): `https://api.holded.com/api/v2/`

---

## 1. Products

| MCP Tool | v1 Method | v1 Route | v2 Method | v2 Verified Route | Status |
|---|---|---|---|---|---|
| `list_products` | GET | `/products` | GET | `/api/v2/products` | MAPPED |
| `create_product` | POST | `/products` | POST | `/api/v2/products` | MAPPED — payload differences (see §2) |
| `get_product` | GET | `/products/{productId}` | GET | `/api/v2/products/{productId}` | MAPPED |
| `update_product` | PUT | `/products/{productId}` | PUT | `/api/v2/products/{productId}` | MAPPED — field name/type differences |
| `delete_product` | DELETE | `/products/{productId}` | DELETE | `/api/v2/products/{productId}` | MAPPED |
| `get_product_main_image` | GET | `/products/{productId}/image` | GET | `/api/v2/products/{productId}/image` | MAPPED |
| `list_product_images` | GET | `/products/{productId}/images` | GET | `/api/v2/products/{productId}/images` | MAPPED |
| `get_product_secondary_image` | GET | `/products/{productId}/images/{imageId}` | GET | `/api/v2/products/{productId}/images/{imageId}` | MAPPED |
| `update_product_stock` | PUT | `/products/{productId}/stock` | PUT | `/api/v2/products/{productId}/stock` | MAPPED — breaking payload change (see §2) |

## 2. Warehouses

| MCP Tool | v1 Method | v1 Route | v2 Method | v2 Verified Route | Status |
|---|---|---|---|---|---|
| `list_warehouses` | GET | `/warehouses` | GET | `/api/v2/warehouses` | MAPPED — response envelope change |
| `create_warehouse` | POST | `/warehouses` | POST | `/api/v2/warehouses` | MAPPED — address now nested object |
| `get_warehouse` | GET | `/warehouses/{warehouseId}` | GET | `/api/v2/warehouses/{warehouseId}` | MAPPED |
| `update_warehouse` | PUT | `/warehouses/{warehouseId}` | **PATCH** | `/api/v2/warehouses/{warehouseId}` | MAPPED — HTTP verb changes PUT → PATCH |
| `delete_warehouse` | DELETE | `/warehouses/{warehouseId}` | DELETE | `/api/v2/warehouses/{warehouseId}` | MAPPED |
| `list_warehouse_stock` | GET | `/warehouses/{warehouseId}/stock` | GET | `/api/v2/warehouses/{warehouseId}/stock` | MAPPED — cursor pagination + field renames |

---

## 3. Notes: Pagination, Envelopes & Payload Differences

### 3.1 Pagination style

| Resource | v1 style | v2 style |
|---|---|---|
| Products list | page-based: `?page=N&limit=M` (max 500, client-side slice) | cursor-based: `?cursor=<opaque>&limit=N` (max 100/page); response: `{items, cursor, has_more}` |
| Warehouse list | none (all returned) | none (all returned); response: `{items: [...]}` |
| Warehouse stock | page-based: `?page=N&limit=M` | cursor-based: `?cursor=<opaque>`; response: `{items, cursor, has_more}` |

**Impact:** MCP's virtual pagination (server-side slice of fetched data) will need rethinking for `list_products` — v2 caps at 100/page so fetching >100 requires following cursor chain; the v1 max-500 trick no longer works in a single call.

### 3.2 `update_product_stock` — breaking payload change

| Field | v1 | v2 |
|---|---|---|
| Stock delta | `units` (number) | `stock_variation` (float) — semantically equivalent |
| Warehouse | `warehouseId` (string, **optional**) | `warehouse_id` (string, **required**) |
| Variant | not present | `variant_id` (string\|null, optional) |
| Audit note | not present | `description` (string\|null, optional) |

`warehouse_id` is now mandatory in v2. Any call that omitted `warehouseId` in v1 will fail without adaptation.

### 3.3 `create_product` — kind enum change

| v1 `kind` values | v2 `kind` values |
|---|---|
| `"product"`, `"service"` | `"simple"`, `"lots"`, `"pack"`, `"variants"`, `"serialnumbers"` |

`"service"` has no direct v2 equivalent as a `kind` — services in v2 are likely managed via a different API path (not in the products API). Mapping of `"product"` → `"simple"` is straightforward.

### 3.4 Price/cost field types

v1: `price`, `costPrice` are **numbers**.
v2: `price`, `cost` are **decimal strings** (e.g. `"99.95"`). Field also renamed: `costPrice` → `cost`.

### 3.5 Warehouse update — HTTP verb

v1 uses `PUT /warehouses/{warehouseId}`.
v2 uses `PATCH /api/v2/warehouses/{warehouseId}`.
Address fields are now nested under an `address` object: `{address, city, province, postal_code, country, country_code}`. `postal_code` (snake_case) replaces `postalCode` (camelCase).

### 3.6 Image upload — new write path

v1 exposes only GET endpoints for images (main image, list, get by ID). v2 adds:
- `POST /api/v2/products/{productId}/images` — multipart/form-data upload with `file` field (jpeg/png/gif, max 200 images/product).

This is a new write capability not present in v1 MCP tools.

### 3.7 New GET endpoints in v2 (no v1 equivalent)

- `GET /api/v2/products/{productId}/stock` — full per-warehouse stock breakdown with `{total, available, reserved, in_transit, warehouses[]}`. The v1 stock was embedded in the product object only.
- `GET /api/v2/products/{productId}/stock/transit` — transit stock for incoming purchase orders.

---

## 4. Gaps & Risks

### Gaps (v1 operations with no v2 equivalent)
- None confirmed. All 15 v1 MCP operations have a v2 route counterpart.

### Risks (breaking changes requiring code adaptation)

1. **`warehouse_id` now required in stock update** — highest risk. Any MCP call without a warehouse will error. Need to fetch the default warehouse first or require it in the tool schema.
2. **Cursor pagination replaces page-based** — `list_products` and `list_warehouse_stock` must implement cursor chain logic; the existing virtual-pagination approach (fetch all, slice) breaks at >100 items on products (v2 hard limit per call).
3. **HTTP verb change on warehouse update** — `PUT` → `PATCH`; HoldedClient must support PATCH or the call will fail.
4. **Field renames across the board** — camelCase → snake_case throughout (e.g., `costPrice` → `cost`, `warehouseId` → `warehouse_id`, `productId` → `product_id` in responses, `postalCode` → `postal_code`); all serialization/deserialization needs updating.
5. **`kind` enum breakage for services** — products of kind `"service"` cannot be created via the v2 products API with the same value; behavior TBD.

---

## 5. v2-Only Capabilities (Not in v1 MCP)

### Tarifas / Price Lists (`inventory:rates.*`)
| Method | Verified Route | Description |
|---|---|---|
| POST | `/api/v2/price-lists` | Create price list |
| GET | `/api/v2/price-lists` | List all price lists |
| GET | `/api/v2/price-lists/{priceListId}` | Get price list |
| PATCH | `/api/v2/price-lists/{priceListId}` | Update price list |
| DELETE | `/api/v2/price-lists/{priceListId}` | Delete price list |

### Órdenes de Producción / Production Orders (`inventory:production-orders.*`)
| Method | Verified Route | Description |
|---|---|---|
| POST | `/api/v2/production-orders` | Create production order |
| GET | `/api/v2/production-orders` | List production orders |
| GET | `/api/v2/production-orders/{productionOrderId}` | Get production order |
| PUT | `/api/v2/production-orders/{productionOrderId}` | Update production order |
| DELETE | `/api/v2/production-orders/{productionOrderId}` | Delete production order |

### Other v2-only endpoints
- `POST /api/v2/products/{productId}/images` — image upload (multipart)
- `GET /api/v2/products/{productId}/stock` — rich per-warehouse stock breakdown
- `GET /api/v2/products/{productId}/stock/transit` — transit stock view

---

## 6. OAuth Scopes Required (v2)

| Resource | Read scope | Write scope |
|---|---|---|
| Products | `inventory:products.read` | `inventory:products.write` |
| Warehouses | `inventory:warehouses.read` | `inventory:warehouses.write` |
| Price Lists | `inventory:rates.read` | `inventory:rates.write` |
| Production Orders | `inventory:production-orders.read` | `inventory:production-orders.write` |
