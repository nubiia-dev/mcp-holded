# v1 → v2 Endpoint Mapping: Projects · Accounting · Banking

_Researched 2026-07-06. Routes verified against individual Holded developer-reference pages._

---

## 1. Mapping Table

### A — Time Tracking (`time-tracking.ts`, base: `api.holded.com/api/projects/v1`)

| MCP tool | v1 method + route | v2 method + literal route | Status |
|---|---|---|---|
| `list_project_times` | `GET /projects/times` | `GET https://api.holded.com/api/v2/project-times` | **NEEDS MIGRATION** |
| `list_project_times_by_project` | `GET /projects/{projectId}/times` | `GET https://api.holded.com/api/v2/projects/{projectId}/times` | **NEEDS MIGRATION** |
| `get_project_time` | `GET /projects/{projectId}/times/{timeTrackingId}` | `GET https://api.holded.com/api/v2/projects/{projectId}/times/{timeId}` | **NEEDS MIGRATION** |

All three read operations have confirmed v2 equivalents. The path parameter name changes from `timeTrackingId` → `timeId` but the semantic is identical.

---

### B — Accounting (`accounting.ts`, base: `api.holded.com/api/accounting/v1`)

| MCP tool | v1 method + route | v2 method + literal route | Status |
|---|---|---|---|
| `get_chart_of_accounts` | `GET /chartofaccounts` | `GET https://api.holded.com/api/v2/accounting-accounts` | **ALREADY-V2** (ledger.ts → `list_accounting_accounts`) |
| `get_daily_ledger` | `GET /dailyledger?starttmp=&endtmp=` | `GET https://api.holded.com/api/v2/ledger-entries?start_date=&end_date=` | **ALREADY-V2** (ledger.ts → `list_ledger_entries`) |

Both accounting v1 operations are already covered by `ledger.ts`. The v1 tools remain active as read-only counterparts; the v2 tools add write operations (create account, create ledger entry).

---

### C — Banking (`banking.ts`, base: `api.holded.com/api/internal`)

| MCP tool | v1 (internal) method + route | v2 method + literal route | Status |
|---|---|---|---|
| `reconcile_bank_transaction` | `POST /internal/banking/accounts/{accountId}/transactions/{transactionId}/reconcile` | `POST https://api.holded.com/api/v2/treasury/accounts/{bankingAccountId}/bank-movements/{movementId}/reconcile` | **ALREADY-V2** (treasury-v2.ts → `reconcile_bank_movement`) |

`banking.ts` has only one tool. Its v2 successor is fully implemented. No "list transactions" tool existed in the internal banking layer — the v2 equivalent is `list_bank_movements` in treasury-v2.ts.

---

## 2. Notes

### Pagination

| Layer | v1 behaviour | v2 behaviour |
|---|---|---|
| Time tracking (global) | Returns entire dataset in one call | Cursor-paginated; default 50 / max configurable |
| Time tracking (per-project) | Returns entire dataset in one call | Cursor-paginated; default 50 |
| Daily ledger | Returns all lines in range in one call | Cursor-paginated; default 50, max 100 per page |
| Chart of accounts | Returns full chart in one call | Cursor-paginated; optional `archived`, `start_date`, `end_date`, `include_empty` query filters |

Large date ranges on the daily ledger (v2) will now require multiple cursor-paginated requests instead of one.

### get_daily_ledger — parameter migration (HIGH RISK)

The v1 tool accepts **Unix timestamps** (`starttmp`, `endtmp` in seconds). The v2 endpoint requires **ISO 8601 date strings** (`start_date`, `end_date`, required). Both must be provided. Any wrapper that passes v1-style numeric timestamps directly to v2 will receive a 422 error.

The v2 `list_ledger_entries` tool in `ledger.ts` does **not** yet expose the `start_date`/`end_date` filters as named parameters — it passes the `args` object through `cursorParams()` which only extracts `cursor` and `limit`. Date filtering must be added explicitly.

The v2 endpoint also gains an optional `account` query parameter (filter by PGC account number) that has no v1 equivalent.

### get_chart_of_accounts — functional equivalence

`GET /api/v2/accounting-accounts` is a functional superset: same fields (`num`/`color` → `id`/`color`, `name`, `group`, `debit`, `credit`, `balance`) but cursor-paginated and with additional optional filters (`archived`, `start_date`, `end_date`, `include_empty`). The v1 tool returns a flat array; v2 returns `{ items[], cursor, has_more }`. The `list_accounting_accounts` tool in `ledger.ts` already normalises this via `normalizeV2List`.

### reconcile_bank_transaction — payload shape incompatibility (HIGH RISK)

| Field | v1 internal body | v2 official body |
|---|---|---|
| Entity name | "transaction" | "bank-movement" |
| Document ref | `entryId` (string, optional) | `documents[].document_id` + `documents[].document_type` (array) |
| Empty body | Reconciles without document | Reconciles without document (same behaviour) |

The internal API accepted a free-form `entryId`. The v2 API requires typed document references via a `documents[]` array with a constrained `document_type` enum (`invoice | salesreceipt | purchase | creditnote | purchaserefund | payroll | payment | remittance | purchasereceipt | collection | receipt | entry`). Any caller using the old payload must be rewritten.

### list_project_times — response shape change (MEDIUM RISK)

v1 returns a nested array of project objects, each with a `timeTracking[]` child array. The MCP tool then applies client-side date/approved filtering and optional flattening. v2 returns a flat cursor-paginated list of time entry objects at `GET /api/v2/project-times`. The nested shape no longer exists in v2 — the MCP tool's `shapeProjectTimes()` flattening/filtering logic will need to be rewritten or removed.

---

## 3. Gaps, Risks, and v2-Only Capabilities

### Gaps (no v1 MCP equivalent → new in v2)

| v2 endpoint | Route | Notes |
|---|---|---|
| List projects | `GET /api/v2/projects` | Status filter: active, in_progress, completed, cancelled, waiting, budgeted |
| Get project | `GET /api/v2/projects/{projectId}` | — |
| Get project summary | `GET /api/v2/projects/{projectId}/summary` | — |
| Create project | `POST /api/v2/projects` | Fields: name (req), description, due_date, contact_id |
| Update project | `PUT /api/v2/projects/{projectId}` | — |
| Delete project | `DELETE /api/v2/projects/{projectId}` | — |
| List tasks | `GET /api/v2/tasks` | Cursor-paginated; scope: `projects:projects.read` |
| Get task | `GET /api/v2/tasks/{taskId}` | — |
| Create task | `POST /api/v2/tasks` | — |
| Update task | `PUT /api/v2/tasks/{taskId}` | — |
| Delete task | `DELETE /api/v2/tasks/{taskId}` | — |
| Create time entry | `POST /api/v2/projects/{projectId}/times` | Fields: duration (req), user_id, description, date (ISO 8601), task_id, cost_per_hour, category |
| Update time entry | `PUT /api/v2/projects/{projectId}/times/{timeId}` | — |
| Delete time entry | `DELETE /api/v2/projects/{projectId}/times/{timeId}` | — |
| API usage (token) | `GET /api/v2/usage` | Returns usage, limit, period, secondary_usages, user_usages |
| API usage (by type) | `GET /api/v2/usage/type` | — |

### Risks

| # | Risk | Severity | Detail |
|---|---|---|---|
| R1 | `get_daily_ledger` timestamp → date-string migration | HIGH | v1 `starttmp`/`endtmp` (Unix seconds) must be converted to ISO date strings before calling v2. `list_ledger_entries` in ledger.ts does not yet surface `start_date`/`end_date` as named parameters. |
| R2 | `reconcile_bank_transaction` payload breaking change | HIGH | v1 `{ entryId }` → v2 `{ documents: [{ document_id, document_type }] }`. Any caller passing the v1 payload to v2 will get a 400/422. |
| R3 | `list_project_times` response shape change | MEDIUM | v1 nested `project.timeTracking[]` structure disappears in v2. Client-side filtering/flattening in `shapeProjectTimes()` must be adapted to the flat cursor-paginated v2 list. |
| R4 | Daily ledger pagination for long date ranges | MEDIUM | v2 caps at 100 entries per page. A full fiscal year previously returned in one v1 call may now require dozens of cursor iterations. |
| R5 | `list_ledger_entries` missing date filter params | MEDIUM | `ledger.ts` currently only passes `cursor` + `limit` via `cursorParams()`. The v2 `start_date`/`end_date` required params are not wired up — any call without them will fail with 422. |

### v2-Only Scope Tokens (new auth requirements)

- `projects:projects.read` — required for all project, task, and time-tracking reads
- `projects:projects.write` — required for create/update/delete on projects, tasks, time entries
- `accounting:chart-of-accounts.read` — accounting accounts list
- `accounting:daily-ledger.read` — ledger entries list
- `accounting:banks.write` — bank movement reconciliation
- `usage:api.read` (assumed) — API usage endpoints

---

_Sources: individual Holded developer reference pages at `https://www.holded.com/es/desarrolladores/referencia-api/` — each route verified on its own page._
