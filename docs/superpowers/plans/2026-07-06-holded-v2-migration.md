# Holded API v2 Full Migration (2.0.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every tool to the Holded API v2 (v2-only client, Bearer auth, cursor pagination) and release as breaking 2.0.0.

**Architecture:** Migrate tool files one by one (each keeps its tool names, adopts v2 routes from the normative mapping annexes, and switches pagination to cursor-native), then flip the client to v2-only (single Bearer key, no apiGroup), then verify read-paths against the real Holded account with a probe script, then document and cut the breaking release.

**Tech Stack:** TypeScript ESM (`.js` imports), node-fetch, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-06-holded-v2-migration-design.md`
**Normative route annexes (verified against individual doc pages):** `docs/superpowers/specs/v2-mapping/{sales-documents,inventory,contacts-finance,projects-accounting-banking}.md`

## Global Constraints

- Tool NAMES do not change (only removals per spec). Argument changes allowed only where the spec/annex mandates (pagination args, attachment filename, stock warehouse_id, ledger dates).
- All list tools: accept optional `limit` + `cursor`, return `normalizeV2List(...)` → `{ items, nextCursor?, hasMore? }`. No `page`/`pageSize` remain anywhere.
- Responses are passthrough: no camelCase conversion, no number parsing. v2 returns `snake_case` fields and amounts as strings with decimal comma (`"460,00"`) — tool descriptions must mention this where amounts appear.
- `fields` / `summary` conveniences: keep where they exist today, applied to the returned page only.
- Unsupported v1 operations throw: `` `${operation} on ${resource} is not supported by the Holded API v2` `` — never silently no-op.
- Every route MUST match the annex table for its resource. If an implementer finds a discrepancy between this plan and the annex, the ANNEX wins; note it in the report.
- During Tasks 1–10 the client still has v1 groups; migrated tools pass `'v2'` explicitly as the apiGroup argument on every call. Task 11 removes the parameter repo-wide.
- After each task: `npx vitest run` green and `npx tsc --noEmit` clean before committing. Conventional commits, NO Claude references, NO Co-Authored-By.
- Work directly in /Users/samu/workspace/mcp-holded on branch `feat/holded-api-v2-migration`. No worktrees. Do NOT push.
- `.env.v2.local` holds a real API key: NEVER commit it, never print it in reports.

---

### Task 1: Rewrite normalizeV2List for the real v2 envelope

**Files:**
- Modify: `src/utils/v2-pagination.ts`
- Test: `src/__tests__/v2-pagination.test.ts`

**Interfaces:**
- Produces: `normalizeV2List(response: unknown): { items: unknown[]; nextCursor?: string; hasMore?: boolean }` — every list tool in Tasks 3–10 relies on this exact contract. `cursorParams` unchanged.

The REAL envelope (verified live): `{ "items": [...], "cursor": "page:2" | null, "has_more": true|false }`.

- [ ] **Step 1: Replace the normalizeV2List tests** in `src/__tests__/v2-pagination.test.ts` with:

```typescript
describe('normalizeV2List', () => {
  it('normalizes the real v2 envelope { items, cursor, has_more }', () => {
    expect(normalizeV2List({ items: [{ id: 1 }], cursor: 'page:2', has_more: true })).toEqual({
      items: [{ id: 1 }],
      nextCursor: 'page:2',
      hasMore: true,
    });
  });

  it('omits nextCursor when cursor is null and reports hasMore false', () => {
    const result = normalizeV2List({ items: [], cursor: null, has_more: false });
    expect(result).toEqual({ items: [], hasMore: false });
    expect(result).not.toHaveProperty('nextCursor');
  });

  it('wraps bare arrays in { items }', () => {
    expect(normalizeV2List([{ id: 1 }])).toEqual({ items: [{ id: 1 }] });
  });

  it('still accepts legacy fallback shapes', () => {
    expect(normalizeV2List({ items: [1], nextCursor: 'abc' }).nextCursor).toBe('abc');
    expect(normalizeV2List({ data: [1], next: 'abc' }).nextCursor).toBe('abc');
  });

  it('tolerates null/undefined responses', () => {
    expect(normalizeV2List(null)).toEqual({ items: [] });
    expect(normalizeV2List(undefined)).toEqual({ items: [] });
  });

  it('strips raw cursor fields from the passthrough', () => {
    const result = normalizeV2List({ items: [1], cursor: 'page:2', has_more: true, extra: 'x' });
    expect(result).not.toHaveProperty('cursor');
    expect(result).not.toHaveProperty('has_more');
    expect(result.extra).toBe('x');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/v2-pagination.test.ts` — expect FAIL (cursor-string envelope not handled).

- [ ] **Step 3: Rewrite** the function in `src/utils/v2-pagination.ts`:

```typescript
export interface V2ListResult {
  items: unknown[];
  nextCursor?: string;
  hasMore?: boolean;
  [key: string]: unknown;
}

export function normalizeV2List(response: unknown): V2ListResult {
  if (Array.isArray(response)) {
    return { items: response };
  }

  const obj = (response ?? {}) as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.data) ? obj.data : [];

  // Real v2 envelope: cursor is a plain string ("page:2") or null; legacy
  // fallbacks kept for robustness against undocumented variants.
  const cursorObj =
    typeof obj.cursor === 'object' && obj.cursor !== null
      ? (obj.cursor as Record<string, unknown>)
      : undefined;
  const paginationObj = obj.pagination as Record<string, unknown> | undefined;
  const candidates = [
    obj.cursor,
    obj.nextCursor,
    obj.next,
    cursorObj?.next,
    paginationObj?.nextCursor,
    paginationObj?.next,
  ];
  const nextCursor = candidates.find((c) => typeof c === 'string' && c.length > 0) as
    | string
    | undefined;

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!['cursor', 'has_more', 'pagination', 'data', 'next', 'nextCursor', 'items'].includes(key)) {
      rest[key] = value;
    }
  }

  const result: V2ListResult = { ...rest, items };
  if (nextCursor) {
    result.nextCursor = nextCursor;
  }
  if (typeof obj.has_more === 'boolean') {
    result.hasMore = obj.has_more;
  }
  return result;
}
```

`cursorParams` stays as-is.

- [ ] **Step 4:** `npx vitest run` — the treasury/team/ledger tests that assert old shapes may now fail (they mock `{ items, nextCursor }` legacy fallback shapes, which still work). If any fail, update ONLY their expectations to the new contract. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `fix: normalize the real v2 list envelope (cursor string + has_more)`

---

### Task 2: HoldedClient.patch()

**Files:**
- Modify: `src/holded-client.ts`
- Test: `src/__tests__/holded-client.test.ts`

**Interfaces:**
- Produces: `client.patch<T>(endpoint, body?, apiGroup?)` — same shape as `put`. Used by Task 4 (warehouses) and any annex-mandated PATCH.

- [ ] **Step 1: Test** (inside the v2 describe block):

```typescript
    it('sends PATCH with body and Bearer auth on v2', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '{}' });
      const v2Client = new HoldedClient('v1-key', 'sk_live_test');
      await v2Client.patch('/warehouses/w1', { name: 'x' }, 'v2');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/v2/warehouses/w1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'x' }) })
      );
    });
```

- [ ] **Step 2:** Run focused test → FAIL (`patch is not a function`).

- [ ] **Step 3: Implement** — in `request()`, extend the body condition to `method === 'POST' || method === 'PUT' || method === 'PATCH'`, and add after `put`:

```typescript
  async patch<T>(
    endpoint: string,
    body?: unknown,
    apiGroup: ApiGroup = DEFAULT_API_GROUP
  ): Promise<T> {
    return this.request<T>('PATCH', endpoint, body, undefined, apiGroup);
  }
```

- [ ] **Step 4:** Full suite + tsc clean. **Step 5: Commit** — `feat: add PATCH support to HoldedClient`

---

### Task 3: Migrate contacts.ts + contact-groups.ts

**Files:**
- Modify: `src/tools/contacts.ts`, `src/tools/contact-groups.ts`
- Test: `src/__tests__/contacts.test.ts`, `src/__tests__/contact-groups.test.ts`
- Normative routes: `docs/superpowers/specs/v2-mapping/contacts-finance.md` (sections Contactos and Grupos)

**Interfaces:**
- Consumes: `normalizeV2List`, `cursorParams` (Task 1); client `'v2'` group.

Transformation rules (apply to BOTH files, every tool):
1. Every client call gains `'v2'` as apiGroup arg; routes per annex: contacts stay `/contacts...`; groups change slug `/contactgroups` → `/contact-groups`.
2. List tools: replace `page`/`pageSize` inputSchema props and virtual pagination code with `limit`/`cursor` + `normalizeV2List(await client.get(route, cursorParams(args), 'v2'))`. Keep `fields`/`summary` if present, applied to the returned page (`result.items`), preserving `nextCursor`/`hasMore` in the output.
3. `get_contact_attachment`: input arg `attachmentId` → `filename` (type string, description: "attachment filename as returned by list_contact_attachments"); route `/contacts/{contactId}/attachments/{filename}`. Mention the breaking change in the description.
4. Update every affected test: routes assert the new path + `'v2'` third arg; list tests mock `{ items: [...], cursor: 'page:2', has_more: true }` and assert the normalized result (`nextCursor: 'page:2'`).

Representative pattern (list tool after migration):

```typescript
    list_contacts: {
      description:
        'List contacts (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page (API caps at 100)' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Project only these fields per item' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string; fields?: string[] } = {}) => {
        const result = normalizeV2List(await client.get('/contacts', cursorParams(args), 'v2'));
        if (args.fields?.length) {
          result.items = (result.items as Array<Record<string, unknown>>).map((item) => {
            const picked: Record<string, unknown> = {};
            for (const f of args.fields as string[]) if (f in item) picked[f] = item[f];
            return picked;
          });
        }
        return result;
      },
    },
```

- [ ] **Step 1:** Update the two test files to the v2 contract (routes, `'v2'` arg, envelope mocks, `filename` arg). Run → FAIL.
- [ ] **Step 2:** Migrate both tool files per rules. Run focused tests → PASS.
- [ ] **Step 3:** Full suite + tsc clean.
- [ ] **Step 4: Commit** — `feat!: migrate contacts and contact groups to holded api v2`

---

### Task 4: Migrate products.ts + warehouses.ts

**Files:**
- Modify: `src/tools/products.ts`, `src/tools/warehouses.ts`
- Test: `src/__tests__/products.test.ts`, `src/__tests__/warehouses.test.ts`
- Normative routes: `docs/superpowers/specs/v2-mapping/inventory.md`

Same transformation rules as Task 3, plus:
1. Routes unchanged in shape (`/products...`, `/warehouses...`) but all on `'v2'`.
2. `update_product_stock`: `warehouse_id` becomes REQUIRED in inputSchema (annex §2: v2 rejects stock updates without it); payload per annex.
3. `update_warehouse`: uses `client.patch(`/warehouses/${id}`, data, 'v2')` (verb change PUT → PATCH; test asserts `client.patch`).
4. `list_warehouse_stock` + `list_products`: cursor pagination (100/page cap noted in descriptions).
5. Image tools keep GET routes per annex.
6. Mock-client: add `patch` spy in `src/__tests__/mock-client.ts`: `vi.spyOn(client, 'patch').mockResolvedValue({ success: true });`

- [ ] **Step 1:** Update tests (include one asserting `client.patch` for update_warehouse and one asserting the schema requires warehouse_id — assert `tools.update_product_stock.inputSchema.required` contains `'warehouse_id'`). Run → FAIL.
- [ ] **Step 2:** Migrate. Focused tests PASS. **Step 3:** Full suite + tsc. **Step 4: Commit** — `feat!: migrate products and warehouses to holded api v2`

---

### Task 5: Migrate payments.ts, taxes.ts, services.ts, sales-channels.ts

**Files:**
- Modify: `src/tools/payments.ts`, `src/tools/taxes.ts`, `src/tools/services.ts`, `src/tools/sales-channels.ts`
- Test: their four test files
- Normative routes: `docs/superpowers/specs/v2-mapping/contacts-finance.md`

Rules of Task 3 apply. Specifics:
1. Routes: payments `/payments...` (same shape), taxes `/taxes`, services `/services...`, sales channels slug change `/saleschannels` → `/sales-channels`.
2. `get_taxes`: v2 returns `{ items: [...] }` (verified live) — feed through `normalizeV2List`, keep `fields`/`summary` behavior on the page.
3. `update_payment` v1 used read-then-merge to avoid blanking fields (annex note). Keep the read-then-merge behavior against v2 routes (safe default; annex marks partial-update support unconfirmed).
4. `list_payments`: v1 date filters — keep the tool's date args if they exist, forwarding as query params per annex note (param names unconfirmed → forward as-is and flag in description "date filter params pending live verification").

- [ ] **Step 1:** Update tests → FAIL. **Step 2:** Migrate → PASS. **Step 3:** Full suite + tsc. **Step 4: Commit** — `feat!: migrate payments, taxes, services and sales channels to holded api v2`

---

### Task 6: Migrate numbering-series.ts, expenses-accounts.ts, remittances.ts, treasuries.ts

**Files:**
- Modify: the four tool files
- Test: their four test files
- Normative routes: `docs/superpowers/specs/v2-mapping/contacts-finance.md`

Rules of Task 3 apply. Specifics:
1. Numbering series: slug `/numberseries/{docType}` → `/numbering-series/{type}` (param renamed `type` in route; the tool arg may keep its current name, mapped into the new path).
2. Expenses accounts: `/expensesaccounts` → `/expenses-accounts` per annex (verify slug in annex table; annex wins).
3. Remittances: `/remittances...` → `/treasury/remittances...` (namespace relocation).
4. Treasuries (`list_treasuries`/`get_treasury`/`create_treasury`): per annex — v2 successor is `/treasury/accounts`. `treasury-v2.ts` already covers accounts CRUD; therefore in `treasuries.ts` map: list/get to `/treasury/accounts` routes; `create_treasury` to POST `/treasury/accounts`. Add a description note that these overlap with `list_bank_accounts`/`get_bank_account`/`create_bank_account` and will be consolidated in 2.1.

- [ ] **Step 1:** Tests → FAIL. **Step 2:** Migrate → PASS. **Step 3:** Full suite + tsc. **Step 4: Commit** — `feat!: migrate numbering series, expenses accounts, remittances and treasuries to holded api v2`

---

### Task 7: documents.ts part 1 — docType router + CRUD

**Files:**
- Modify: `src/tools/documents.ts`
- Test: `src/__tests__/documents.test.ts`
- Normative routes: `docs/superpowers/specs/v2-mapping/sales-documents.md` (per-docType tables)

**Interfaces:**
- Produces: internal module constant `DOC_RESOURCES: Record<string, string | null>` and helper `docBase(docType: string): string` used by Task 8. Contract:

```typescript
// v1 docType → v2 resource base path. null = create-only special case.
const DOC_RESOURCES: Record<string, string | null> = {
  invoice: '/invoices',
  salesreceipt: '/sales-receipts',
  creditnote: '/credit-notes',
  receiptnote: '/receipt-notes', // annex mapping UNVERIFIED — flagged; Task 12 probes it live
  estimate: '/estimates',
  proform: '/proformas',
  salesorder: '/sales-orders',
  waybill: '/waybills',
  purchase: '/purchases',
  purchaseorder: '/purchase-orders',
  purchaserefund: null, // v2 only supports creation via POST /purchases/refund
};

function docBase(docType: string): string {
  const base = DOC_RESOURCES[docType];
  if (base === undefined) {
    throw new Error(`Unknown docType '${docType}'`);
  }
  if (base === null) {
    throw new Error(
      `Only creation is supported for '${docType}' by the Holded API v2 (POST /purchases/refund). ` +
        'List/get/update/delete purchase refunds are not available in v2.'
    );
  }
  return base;
}
```

Migration rules for the CRUD tools (`list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`, `get_document_payments`):
1. `list_documents`: cursor pagination (Task 3 pattern) on `client.get(docBase(t), cursorParams(args), 'v2')`; keep `fields`/`summary` page-scoped. Drop any v1 date-range params not confirmed in the annex; keep those the annex confirms.
2. `get/update/delete`: `${docBase(t)}/${id}` with `'v2'`.
3. `create_document`: if docType === 'purchaserefund' → `client.post('/purchases/refund', payload, 'v2')`; else `client.post(docBase(t), payload, 'v2')`. Keep the existing payload-building/validation logic intact except renames the annex mandates.
4. `get_document_payments`: reads the document via GET `${docBase(t)}/${id}` and returns its payments-related field(s); note in description that the v2 field name may differ from v1 `paymentsDetail` (passthrough the whole document if the field is absent).
5. Every unsupported combination goes through `docBase`'s clear error. Update the docType enum in inputSchemas to the same 11 values (unchanged).

- [ ] **Step 1:** Update the CRUD-related tests in `documents.test.ts`: per docType route assertions (at minimum invoice, purchase, purchaserefund-error, receiptnote), envelope mocks, `'v2'` arg. Include:

```typescript
  it('rejects non-create operations on purchaserefund with a clear v2 error', async () => {
    await expect(
      tools.get_document.handler({ docType: 'purchaserefund', documentId: 'x' })
    ).rejects.toThrow(/Only creation is supported/);
  });

  it('creates purchaserefund via the dedicated v2 route', async () => {
    await tools.create_document.handler({ docType: 'purchaserefund', contact: 'c1', items: [] } as never);
    expect(client.post).toHaveBeenCalledWith('/purchases/refund', expect.anything(), 'v2');
  });
```

Run → FAIL.
- [ ] **Step 2:** Implement router + migrate CRUD handlers. → PASS. **Step 3:** Full suite + tsc (Task 8 ops still on v1 routes — that is fine, their tests still pass unmodified). **Step 4: Commit** — `feat!: route document crud through holded api v2 per-type resources`

---

### Task 8: documents.ts part 2 — special operations

**Files:**
- Modify: `src/tools/documents.ts`, `src/holded-client.ts` (uploadFile only)
- Test: `src/__tests__/documents.test.ts`
- Normative: same annex, per-docType tables + operations matrix

**Interfaces:**
- Consumes: `DOC_RESOURCES`, `docBase` from Task 7.

Operation matrix (annex is normative; plan summary):
- `pay_document` → POST `${docBase(t)}/${id}/payments` (renamed from `/pay`) — payable types only (invoice, salesreceipt, creditnote, receiptnote, purchase, per annex tables); others → unsupported error.
- `send_document` → POST `${docBase(t)}/${id}/send`.
- `get_document_pdf` → GET `${docBase(t)}/${id}/pdf`.
- `update_document_pipeline` → PUT `${docBase(t)}/${id}/pipeline` (verb change POST → PUT; use `client.put`).
- `update_document_tracking` → NO EQUIVALENT for all types per annex → always throws the unsupported error (tool stays registered with the explanatory error, description updated).
- `ship_all_items`, `ship_items_by_line`, `get_shipped_units` → only for the docTypes whose annex table maps them (salesorder / purchaseorder / waybill per annex; check tables); all other types → unsupported error. Routes per annex.
- `attach_file_to_document` → POST `${docBase(t)}/${id}/attachments` multipart. Modify `HoldedClient.uploadFile(endpoint, file, filename, apiGroup: ApiGroup = DEFAULT_API_GROUP)` to accept the apiGroup and use `buildHeaders(apiGroup)` minus Content-Type (FormData sets its own); tool passes `'v2'`.
- `list_payment_methods` → GET `/payment-methods` with `'v2'` (verified live: returns `{items:[{id,name,type,status,isDefault,bankingAccountId}]}`).

Unsupported-op helper (add once):

```typescript
function unsupportedOp(operation: string, docType: string): never {
  throw new Error(`${operation} on ${docType} is not supported by the Holded API v2`);
}
```

- [ ] **Step 1:** Update tests: happy-path route assertions per op (invoice pay/send/pdf/pipeline/attach; salesorder ship per annex route) + unsupported assertions (`pay_document` on estimate; `ship_all_items` on invoice; `update_document_tracking` on anything). Run → FAIL.
- [ ] **Step 2:** Implement. → PASS. **Step 3:** Full suite + tsc. **Step 4: Commit** — `feat!: migrate document special operations to holded api v2`

---

### Task 9: Merge accounting into v2 ledger tools

**Files:**
- Modify: `src/tools/accounting.ts`, `src/tools/ledger.ts`
- Test: `src/__tests__/accounting.test.ts`, `src/__tests__/ledger.test.ts`
- Normative: `docs/superpowers/specs/v2-mapping/projects-accounting-banking.md`

Rules:
1. `get_chart_of_accounts` (accounting.ts) → GET `/accounting-accounts` with `'v2'`, cursor pagination + annex filters (`archived`, `start_date`, `end_date`, `include_empty`) as optional args. Description cross-references `list_accounting_accounts` (kept as-is — they now share the endpoint; note consolidation planned for 2.1).
2. `get_daily_ledger` → GET `/ledger-entries` with `'v2'`. Args: `start_date`/`end_date` ISO strings REQUIRED by v2. Backward-softening mandated by spec: also accept legacy `starttmp`/`endtmp` (Unix seconds) and convert:

```typescript
function toIsoDate(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10);
  return value;
}
```

If neither form of a bound is provided, throw: `'get_daily_ledger requires start_date and end_date (ISO) — the Holded API v2 returns 422 without them'`.
3. `list_ledger_entries` (ledger.ts) gains the same optional `start_date`/`end_date` args forwarded as query params (fixes the 422 risk flagged in the annex).

- [ ] **Step 1:** Tests: route+params assertions incl. Unix→ISO conversion (`starttmp: 1750000000` → `start_date: '2025-06-15'`) and the missing-dates error. → FAIL.
- [ ] **Step 2:** Implement. → PASS. **Step 3:** Full suite + tsc. **Step 4: Commit** — `feat!: migrate accounting reads to v2 ledger endpoints with iso date params`

---

### Task 10: Rewrite time-tracking.ts + delete banking.ts

**Files:**
- Modify: `src/tools/time-tracking.ts`
- Delete: `src/tools/banking.ts`, `src/__tests__/banking.test.ts`
- Modify: `src/index.ts` (remove banking import, `EXPERIMENTAL_BANKING_ENABLED`, and both conditional spreads), `src/validation.ts` (remove `reconcileBankTransactionSchema` if unused elsewhere — grep first)
- Test: `src/__tests__/time-tracking.test.ts`
- Normative: `docs/superpowers/specs/v2-mapping/projects-accounting-banking.md`

Rules:
1. `list_project_times` → GET `/project-times` (flat cursor list). The `shapeProjectTimes()` nested flattening is deleted; date/approved filters that v2 supports go as query params per annex; those it doesn't, apply client-side to the returned page with a description note.
2. `list_project_times_by_project` → GET `/projects/{projectId}/times`.
3. `get_project_time` → GET `/projects/{projectId}/times/{timeId}`.
4. All with `'v2'`, cursor pagination on the list tools.
5. Banking: file + tests deleted; index.ts references removed. The official replacement (`reconcile_bank_movement` in treasury-v2.ts) already exists — mention it in the commit body.

- [ ] **Step 1:** Rewrite time-tracking tests for the flat contract; delete banking tests. → FAIL/compile errors expected.
- [ ] **Step 2:** Implement + delete + index cleanup. → PASS. **Step 3:** Full suite + tsc. **Step 4: Commit** — `feat!: rewrite project time tracking for v2 and remove experimental banking`

---

### Task 11: Flip the client to v2-only (single key)

**Files:**
- Modify: `src/holded-client.ts`, `src/utils/tenant-config.ts`, `src/utils/tenant-context.ts`, `src/index.ts`, `src/__tests__/mock-client.ts`, `src/__tests__/holded-client.test.ts`, `src/__tests__/tenant-config.test.ts`, plus mechanical cleanup of `'v2'` args across all tool files.

**Interfaces:**
- Produces (final client API): `new HoldedClient(apiKey: string)`; `get/post/put/patch/delete/uploadFile` WITHOUT apiGroup parameter; base URL always `https://api.holded.com/api/v2`; header always `Authorization: Bearer <apiKey>`.

Rules:
1. `API_BASES` → single constant `const API_BASE = 'https://api.holded.com/api/v2';`. Remove `ApiGroup` type, `DEFAULT_API_GROUP`, `buildHeaders` branching (Bearer always), `hasV2()`, the second constructor param.
2. 403 hint (scopes) applies always. Missing-key error: constructor throws if key empty.
3. Key resolution (tenant-config): single-tenant `apiKey = process.env.HOLDED_API_KEY_V2 || process.env.HOLDED_API_KEY` (alias `_V2` wins, per spec); multi-tenant `TENANT_N_API_KEY_V2 || TENANT_N_API_KEY`. `TenantConfig` drops `apiKeyV2`. Error message when none: names both vars and says the key must be a v2 key (`pat_…`/`sk_live_…`).
4. index.ts: remove `ANY_TENANT_HAS_V2` and register everything unconditionally; remove `getBankingTools` leftovers if any.
5. Mechanical sweep: remove the `, 'v2'` third/fourth args everywhere (`grep -rn "'v2'" src/tools src/__tests__`); tests updated accordingly (client mocks now asserted without the group arg).
6. mock-client: `new HoldedClient('test-api-key')` with all spies incl. patch.
7. holded-client tests: single-key Bearer expectations; drop v1-header and hasV2 tests; keep retry/error tests.

- [ ] **Step 1:** Update client + config tests to the final contract. → FAIL.
- [ ] **Step 2:** Implement client/config/index changes. **Step 3:** Mechanical sweep of tool files + tests until `npx tsc --noEmit` clean and `npx vitest run` green and `grep -rn "apiGroup\|hasV2\|API_BASES" src/ | grep -v __tests__` returns nothing unexpected.
- [ ] **Step 4: Commit** — `feat!: make the client v2-only with a single Bearer api key`

---

### Task 12: Live verification probe script + fixes

**Files:**
- Create: `scripts/verify-v2.mjs` (NOT in the npm package — check `package.json` `files` field excludes `scripts/`; if there is no `files` field, add `"files": ["dist", "README.md"]`)
- Modify: whatever the probes prove wrong

Script contract: reads the key from `.env.v2.local` (line `HOLDED_API_KEY_V2=...`) or env; performs GET-only probes; prints one line per probe `route → status (envelope keys)`; exits non-zero if any probe returns 404/401/5xx. Probe list (one list-GET per migrated resource):

```
/contacts /contact-groups /payments /payment-methods /taxes /services
/sales-channels /expenses-accounts /treasury/remittances /treasury/accounts
/products /warehouses /invoices /sales-receipts /credit-notes /receipt-notes
/estimates /proformas /sales-orders /waybills /purchases /purchase-orders
/purchase-shipments /project-times /projects /accounting-accounts
/ledger-entries?start_date=2026-01-01&end_date=2026-01-31
/employees /employee-times /salary-records
/treasury/cashflow/invoicing-forecasts
```

Implementation:

```javascript
#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const envFile = (() => {
  try {
    return readFileSync(new URL('../.env.v2.local', import.meta.url), 'utf8');
  } catch {
    return '';
  }
})();
const KEY =
  process.env.HOLDED_API_KEY_V2 ||
  envFile.match(/HOLDED_API_KEY_V2=(.+)/)?.[1]?.trim();
if (!KEY) {
  console.error('No v2 key: set HOLDED_API_KEY_V2 or create .env.v2.local');
  process.exit(2);
}

const ROUTES = [
  '/contacts', '/contact-groups', '/payments', '/payment-methods', '/taxes',
  '/services', '/sales-channels', '/expenses-accounts', '/treasury/remittances',
  '/treasury/accounts', '/products', '/warehouses', '/invoices',
  '/sales-receipts', '/credit-notes', '/receipt-notes', '/estimates',
  '/proformas', '/sales-orders', '/waybills', '/purchases', '/purchase-orders',
  '/purchase-shipments', '/project-times', '/projects', '/accounting-accounts',
  '/ledger-entries?start_date=2026-01-01&end_date=2026-01-31',
  '/employees', '/employee-times', '/salary-records',
  '/treasury/cashflow/invoicing-forecasts',
];

let failures = 0;
for (const route of ROUTES) {
  const sep = route.includes('?') ? '&' : '?';
  const res = await fetch(`https://api.holded.com/api/v2${route}${sep}limit=1`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  let keys = '';
  try {
    const body = await res.json();
    keys = Array.isArray(body) ? '[array]' : Object.keys(body).join(',');
  } catch {
    keys = '(non-json)';
  }
  const ok = res.status === 200;
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${res.status} ${route} → ${keys}`);
}
process.exit(failures ? 1 : 0);
```

- [ ] **Step 1:** Write the script; run `node scripts/verify-v2.mjs`. Every route must print `OK 200`.
- [ ] **Step 2:** For any FAIL: check the annex first, fix the tool route (with its test) to whatever the live API + annex agree on, and re-run until all OK. Document each correction in the report.
- [ ] **Step 3:** `receiptnote` check: both `/receipt-notes` and `/purchase-shipments` return 200. Keep the annex mapping (`/receipt-notes`) and note in the tool's docType description: "receiptnote maps to /receipt-notes; if your account uses purchase shipments (albaranes de compra), those live under purchase-orders shipping". No blind writes to the real account.
- [ ] **Step 4:** Full suite + tsc. **Step 5: Commit** — `test: add live v2 read-probe script and fix routes it caught` (adjust subject if nothing needed fixing: `test: add live v2 read-probe verification script`)

---

### Task 13: README migration guide, rate limits, breaking release commit

**Files:**
- Modify: `README.md`, `src/index.ts` (rate limits), `package.json` (only if the `files` field work from Task 12 wasn't needed there)

Rules:
1. README: rewrite the v2 section as the main configuration docs: `HOLDED_API_KEY` now takes the v2 key (`pat_…`/`sk_live_…`); `HOLDED_API_KEY_V2` accepted as alias. Add a "Migrating from 1.x" section: key requirement, pagination args (`page/pageSize` → `limit/cursor`+`nextCursor`), response format notes (snake_case, string amounts with decimal comma), removed operations (purchaserefund list/get/update/delete/pay; document tracking; ship on non-shippable types; experimental banking tools), attachment-by-filename change, ledger ISO dates.
2. Rate limits in index.ts: add the missing v2 destructive/update entries — `delete_employee_time: 10/min`, `delete_invoicing_forecast: 10/min`, `delete_salary_record` (exists), `delete_bank_account` (exists), plus `update_employee: 30/min`, `update_salary_record: 30/min`, `update_bank_account: 30/min`, `delete_document: 10/min` (exists), `delete_service: 10/min`, `delete_warehouse: 10/min`, `delete_product: 10/min`.
3. Final commit MUST trigger the major release. Use exactly this format:

```bash
git add README.md src/index.ts
git commit -m "feat!: require a Holded API v2 key for all tools

All tools now call the Holded API v2 exclusively (Bearer auth, cursor
pagination, per-type document resources). See README section
'Migrating from 1.x'.

BREAKING CHANGE: HOLDED_API_KEY must now be a Holded API v2 key
(pat_/sk_live_). Pagination arguments changed from page/pageSize to
limit/cursor. purchaserefund supports creation only. Experimental
banking tools were removed in favor of official treasury endpoints."
```

- [ ] **Step 1:** README + rate limits. **Step 2:** `npm run build && npm run lint && npm run test` all green. **Step 3:** The breaking commit above. **Step 4:** STOP — no push without user approval.

---

## Self-review notes

- Spec coverage: client v2-only (T11), single key + alias (T11), PATCH (T2), envelope fix (T1), cursor-native everywhere (T3–T10), documents router + matrix (T7–T8), purchaserefund create-only (T7), receiptnote flagged + probed (T7/T12), contacts filename (T3), remittances namespace (T6), treasuries → /treasury/accounts (T6), stock warehouse_id (T4), warehouse PATCH (T4), ledger ISO + legacy conversion (T9), time-tracking rewrite (T10), banking removal (T10), probe script (T12), README migración + `feat!:` (T13), rate-limit completion (T13).
- Annex-normative pattern: tasks give rules + representative code; exact per-route detail lives in the committed annexes, which implementers MUST read for their resource. This is the single source of truth; discrepancies resolve annex-first.
