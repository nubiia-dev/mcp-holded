# Holded API v2 Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Holded API v2 support (Bearer auth, cursor pagination) for Team/HR, ledger writes and official treasury, keeping every existing v1 tool untouched.

**Architecture:** Extend the existing `HoldedClient` with a new `apiGroup: 'v2'` whose base URL is `https://api.holded.com/api/v2` and whose auth header is `Authorization: Bearer <apiKeyV2>` (v1 groups keep the `key:` header). The v2 key is optional, configured per tenant (`HOLDED_API_KEY_V2` / `TENANT_N_API_KEY_V2`); when absent, v2 tools are not registered. New tools live in three new files following the existing `getXxxTools(client)` pattern.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), `node-fetch`, `@modelcontextprotocol/sdk`, vitest. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-06-holded-api-v2-support-design.md`

## Global Constraints

- Never change behavior of existing v1 tools, headers, or base URLs.
- All imports use the `.js` suffix (ESM), e.g. `from '../holded-client.js'`.
- Tool names are snake_case; read tools set `readOnlyHint: true`; write tools start their description with a write warning ("WRITE: …" / "DESTRUCTIVE: …").
- v2 list tools accept optional `limit` and `cursor` and return `{ items, nextCursor? }` via `normalizeV2List`.
- v2 write tools with unconfirmed payload schemas accept a required `data: object` passed verbatim as the request body, with the description pointing to https://www.holded.com/es/desarrolladores/referencia-api.
- Branch: work on `feat/holded-api-v2-support`. Commit messages: conventional format, **no Claude references, no Co-Authored-By**.
- After each task: `npm run test` green and `npx tsc --noEmit` clean before committing.

---

### Task 1: HoldedClient v2 group (Bearer auth, 403 hint, hasV2)

**Files:**
- Modify: `src/holded-client.ts`
- Modify: `src/__tests__/mock-client.ts`
- Test: `src/__tests__/holded-client.test.ts`

**Interfaces:**
- Produces: `new HoldedClient(apiKey: string, apiKeyV2?: string)`; `client.hasV2(): boolean`; all of `get/post/put/delete` accept `apiGroup: 'v2'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/holded-client.test.ts` inside `describe('HoldedClient', ...)`:

```typescript
  describe('v2 api group', () => {
    it('uses the v2 base URL and Bearer auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ items: [] }),
      });

      const v2Client = new HoldedClient('v1-key', 'sk_live_test');
      await v2Client.get('/employees', undefined, 'v2');

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/v2/employees', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer sk_live_test',
          'Content-Type': 'application/json',
        },
      });
    });

    it('throws a configuration error before any network call when the v2 key is missing', async () => {
      const v1Only = new HoldedClient('v1-key');

      await expect(v1Only.get('/employees', undefined, 'v2')).rejects.toThrow(
        /HOLDED_API_KEY_V2/
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reports hasV2() based on constructor args', () => {
      expect(new HoldedClient('k').hasV2()).toBe(false);
      expect(new HoldedClient('k', 'sk_live_x').hasV2()).toBe(true);
    });

    it('enriches 403 errors on v2 with a scope hint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const v2Client = new HoldedClient('v1-key', 'sk_live_test');
      await expect(v2Client.get('/salary-records', undefined, 'v2')).rejects.toThrow(/scope/);
    });

    it('keeps the legacy key header for v1 groups even when a v2 key is set', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([]),
      });

      const v2Client = new HoldedClient('v1-key', 'sk_live_test');
      await v2Client.get('/contacts');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/invoicing/v1/contacts',
        expect.objectContaining({
          headers: { key: 'v1-key', 'Content-Type': 'application/json' },
        })
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/holded-client.test.ts`
Expected: FAIL — constructor doesn't accept a second argument / `hasV2` is not a function / v2 group unknown.

- [ ] **Step 3: Implement in `src/holded-client.ts`**

Add `v2` to `API_BASES` (keep the doc comment style):

```typescript
const API_BASES = {
  invoicing: 'https://api.holded.com/api/invoicing/v1',
  projects: 'https://api.holded.com/api/projects/v1',
  accounting: 'https://api.holded.com/api/accounting/v1',
  internal: 'https://api.holded.com/api',
  // Holded API v2 (GA June 2026): unified base URL, Bearer auth with scoped
  // keys, cursor pagination. Used only for modules v1 does not cover
  // (Team/HR, ledger writes, official treasury). Requires a separate key.
  v2: 'https://api.holded.com/api/v2',
} as const;
```

Update the class:

```typescript
export class HoldedClient {
  private apiKey: string;
  private apiKeyV2?: string;
  private maxRetries = 3;
  private backoffDelays = [1000, 2000, 4000]; // milliseconds
  private retryableStatusCodes = new Set([429, 502, 503, 504]);

  constructor(apiKey: string, apiKeyV2?: string) {
    this.apiKey = apiKey;
    this.apiKeyV2 = apiKeyV2;
  }

  hasV2(): boolean {
    return Boolean(this.apiKeyV2);
  }

  private buildHeaders(apiGroup: ApiGroup): Record<string, string> {
    if (apiGroup === 'v2') {
      if (!this.apiKeyV2) {
        throw new Error(
          'Holded API v2 key not configured. Set HOLDED_API_KEY_V2 (or TENANT_N_API_KEY_V2 in multi-tenant mode) ' +
            'with an sk_live_… key generated in Holded → Settings → API with the scopes this tool needs.'
        );
      }
      return {
        Authorization: `Bearer ${this.apiKeyV2}`,
        'Content-Type': 'application/json',
      };
    }
    return {
      key: this.apiKey,
      'Content-Type': 'application/json',
    };
  }
  // ...
}
```

In `request()`, replace the inline `headers` literal with:

```typescript
    const headers = this.buildHeaders(apiGroup);
```

and replace the non-retryable error block with:

```typescript
        // Non-retryable error
        if (!response.ok) {
          const errorText = await response.text();
          let message = `Holded API error (${response.status}): ${errorText}`;
          if (response.status === 403 && apiGroup === 'v2') {
            message +=
              ' — the v2 API key may be missing the scope this endpoint requires (e.g. accounting:payrolls.read). Check the key permissions in Holded → Settings → API.';
          }
          throw new Error(message);
        }
```

`uploadFile` stays v1-only — no changes.

Update `src/__tests__/mock-client.ts` so tool tests can exercise v2 tools:

```typescript
export function createMockClient() {
  const client = new HoldedClient('test-api-key', 'test-v2-key');
  // ... (spies unchanged)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run` — Expected: ALL PASS (existing suites must stay green).
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/holded-client.ts src/__tests__/holded-client.test.ts src/__tests__/mock-client.ts
git commit -m "feat: add v2 api group to HoldedClient with Bearer auth

- New apiGroup 'v2' with unified base URL api.holded.com/api/v2
- Optional second constructor arg apiKeyV2; hasV2() helper
- Clear configuration error when a v2 tool runs without a v2 key
- 403 responses on v2 enriched with a scope hint"
```

---

### Task 2: Per-tenant v2 key plumbing

**Files:**
- Modify: `src/utils/tenant-context.ts` (interface `TenantConfig`, `registerTenant`)
- Modify: `src/utils/tenant-config.ts` (env loading)
- Test: `src/__tests__/tenant-config.test.ts` (create)

**Interfaces:**
- Consumes: `new HoldedClient(apiKey, apiKeyV2?)` from Task 1.
- Produces: `TenantConfig.apiKeyV2?: string`; `loadTenantConfigs()` reads `HOLDED_API_KEY_V2` (single-tenant) and `TENANT_<n>_API_KEY_V2` (multi-tenant).

- [ ] **Step 1: Write the failing test** — create `src/__tests__/tenant-config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadTenantConfigs } from '../utils/tenant-config.js';

describe('loadTenantConfigs v2 keys', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Neutralize any ambient config from the developer's shell
    vi.stubEnv('HOLDED_API_KEY', '');
    vi.stubEnv('HOLDED_API_KEY_V2', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('picks up HOLDED_API_KEY_V2 in single-tenant mode', () => {
    vi.stubEnv('HOLDED_API_KEY', 'v1-key');
    vi.stubEnv('HOLDED_API_KEY_V2', 'sk_live_abc');

    const configs = loadTenantConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].apiKey).toBe('v1-key');
    expect(configs[0].apiKeyV2).toBe('sk_live_abc');
  });

  it('leaves apiKeyV2 undefined when the env var is absent', () => {
    vi.stubEnv('HOLDED_API_KEY', 'v1-key');

    const configs = loadTenantConfigs();
    expect(configs[0].apiKeyV2).toBeUndefined();
  });

  it('picks up TENANT_N_API_KEY_V2 in multi-tenant mode', () => {
    vi.stubEnv('TENANT_1_NAME', 'Acme');
    vi.stubEnv('TENANT_1_API_KEY', 'k1');
    vi.stubEnv('TENANT_1_API_KEY_V2', 'sk_live_1');
    vi.stubEnv('TENANT_2_NAME', 'Beta');
    vi.stubEnv('TENANT_2_API_KEY', 'k2');

    const configs = loadTenantConfigs();
    const acme = configs.find((c) => c.name === 'Acme');
    const beta = configs.find((c) => c.name === 'Beta');
    expect(acme?.apiKeyV2).toBe('sk_live_1');
    expect(beta?.apiKeyV2).toBeUndefined();
  });
});
```

Note: `vi.stubEnv(name, '')` sets an empty string; `loadTenantConfigs` treats empty strings as falsy (`if (apiKey)`), which is why stubbing `''` works to neutralize ambient vars. For `apiKeyV2`, normalize empty string to `undefined` in the implementation (`|| undefined`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/tenant-config.test.ts`
Expected: FAIL — `apiKeyV2` is `undefined` in the first and third tests (property doesn't exist yet).

- [ ] **Step 3: Implement**

`src/utils/tenant-context.ts`:

```typescript
export interface TenantConfig {
  id: string;
  name: string;
  apiKey: string;
  apiKeyV2?: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}
```

In `registerTenant`:

```typescript
    const client = new HoldedClient(config.apiKey, config.apiKeyV2);
```

`src/utils/tenant-config.ts` — multi-tenant branch, after reading `apiKey`:

```typescript
      const apiKeyV2 = process.env[`TENANT_${id}_API_KEY_V2`] || undefined;
```

and include `apiKeyV2` in the pushed config object. Single-tenant branch:

```typescript
  const apiKey = process.env.HOLDED_API_KEY;
  const apiKeyV2 = process.env.HOLDED_API_KEY_V2 || undefined;
  if (apiKey) {
    configs.push({
      id: 'default',
      name: 'Default Organization',
      apiKey,
      apiKeyV2,
      enabled: true,
      metadata: { source: 'environment', legacy: true },
    });
```

- [ ] **Step 4: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tenant-context.ts src/utils/tenant-config.ts src/__tests__/tenant-config.test.ts
git commit -m "feat: load optional v2 api key per tenant

- TenantConfig.apiKeyV2 wired into HoldedClient construction
- Reads HOLDED_API_KEY_V2 (single-tenant) and TENANT_N_API_KEY_V2 (multi-tenant)"
```

---

### Task 3: Cursor pagination helper

**Files:**
- Create: `src/utils/v2-pagination.ts`
- Test: `src/__tests__/v2-pagination.test.ts` (create)

**Interfaces:**
- Produces: `normalizeV2List(response: unknown): { items: unknown[]; nextCursor?: string }` and `cursorParams(args: { limit?: number; cursor?: string }): Record<string, string | number>`. Every v2 list tool in Tasks 4–9 uses both.

- [ ] **Step 1: Write the failing test** — create `src/__tests__/v2-pagination.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

describe('normalizeV2List', () => {
  it('wraps bare arrays in { items }', () => {
    expect(normalizeV2List([{ id: 1 }])).toEqual({ items: [{ id: 1 }] });
  });

  it('passes through items and surfaces nextCursor from common field names', () => {
    expect(normalizeV2List({ items: [1], nextCursor: 'abc' })).toEqual({
      items: [1],
      nextCursor: 'abc',
    });
    expect(normalizeV2List({ data: [1], next: 'abc' }).nextCursor).toBe('abc');
    expect(normalizeV2List({ items: [1], cursor: { next: 'abc' } }).nextCursor).toBe('abc');
    expect(normalizeV2List({ items: [1], pagination: { nextCursor: 'abc' } }).nextCursor).toBe(
      'abc'
    );
  });

  it('omits nextCursor when there is no next page', () => {
    const result = normalizeV2List({ items: [1] });
    expect(result.items).toEqual([1]);
    expect(result).not.toHaveProperty('nextCursor');
  });

  it('tolerates null/undefined responses', () => {
    expect(normalizeV2List(null)).toEqual({ items: [] });
  });
});

describe('cursorParams', () => {
  it('builds query params from limit and cursor, skipping undefined', () => {
    expect(cursorParams({})).toEqual({});
    expect(cursorParams({ limit: 50 })).toEqual({ limit: 50 });
    expect(cursorParams({ limit: 50, cursor: 'abc' })).toEqual({ limit: 50, cursor: 'abc' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/v2-pagination.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/utils/v2-pagination.ts`:

```typescript
/**
 * Helpers for Holded API v2 cursor pagination.
 *
 * The exact response envelope of v2 list endpoints is not yet pinned down by
 * the public docs, so normalizeV2List accepts the shapes we may encounter
 * (bare array, { items }, { data }, cursor under several names) and always
 * returns { items, nextCursor? } so MCP clients get a stable contract.
 */

export interface V2ListResult {
  items: unknown[];
  nextCursor?: string;
  [key: string]: unknown;
}

export function normalizeV2List(response: unknown): V2ListResult {
  if (Array.isArray(response)) {
    return { items: response };
  }

  const obj = (response ?? {}) as Record<string, unknown>;
  const items = Array.isArray(obj.items)
    ? obj.items
    : Array.isArray(obj.data)
      ? obj.data
      : [];

  const cursorObj = obj.cursor as Record<string, unknown> | undefined;
  const paginationObj = obj.pagination as Record<string, unknown> | undefined;
  const candidates = [
    obj.nextCursor,
    obj.next,
    cursorObj?.next,
    paginationObj?.nextCursor,
    paginationObj?.next,
  ];
  const nextCursor = candidates.find((c) => typeof c === 'string' && c.length > 0) as
    | string
    | undefined;

  const { cursor: _cursor, pagination: _pagination, data: _data, ...rest } = obj;
  const result: V2ListResult = { ...rest, items };
  if (nextCursor) {
    result.nextCursor = nextCursor;
  }
  return result;
}

export function cursorParams(args: {
  limit?: number;
  cursor?: string;
}): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (args.limit !== undefined) {
    params.limit = args.limit;
  }
  if (args.cursor !== undefined) {
    params.cursor = args.cursor;
  }
  return params;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/v2-pagination.ts src/__tests__/v2-pagination.test.ts
git commit -m "feat: add cursor pagination helpers for api v2 list tools"
```

---

### Task 4: team.ts — employee tools (7)

**Files:**
- Create: `src/tools/team.ts`
- Test: `src/__tests__/team.test.ts` (create)

**Interfaces:**
- Consumes: `client.get/post/put/delete(endpoint, …, 'v2')` (Task 1); `normalizeV2List`, `cursorParams` (Task 3); `createMockClient()` (v2-enabled since Task 1).
- Produces: `getTeamTools(client: HoldedClient)` returning an object with tool keys `list_employees`, `get_employee`, `create_employee`, `update_employee`, `delete_employee`, `get_employee_contract`, `update_employee_contract`. Tasks 5 and 6 add more keys to this same returned object.

- [ ] **Step 1: Write the failing tests** — create `src/__tests__/team.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTeamTools } from '../tools/team.js';

describe('Team Tools — employees', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTeamTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTeamTools(client);
  });

  it('list_employees calls the v2 group with cursor params and normalizes', async () => {
    (client.get as any).mockResolvedValue({ items: [{ id: 'e1' }], nextCursor: 'c2' });

    const result = await tools.list_employees.handler({ limit: 10, cursor: 'c1' });

    expect(client.get).toHaveBeenCalledWith('/employees', { limit: 10, cursor: 'c1' }, 'v2');
    expect(result).toEqual({ items: [{ id: 'e1' }], nextCursor: 'c2' });
  });

  it('get_employee fetches a single employee on v2', async () => {
    await tools.get_employee.handler({ employeeId: 'abc123' });
    expect(client.get).toHaveBeenCalledWith('/employees/abc123', undefined, 'v2');
  });

  it('create_employee posts the data verbatim on v2', async () => {
    const data = { name: 'Jane', email: 'jane@acme.com' };
    await tools.create_employee.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/employees', data, 'v2');
  });

  it('update_employee_contract puts to the contract subresource', async () => {
    const data = { salary: 30000 };
    await tools.update_employee_contract.handler({ employeeId: 'abc', data });
    expect(client.put).toHaveBeenCalledWith('/employees/abc/contract', data, 'v2');
  });

  it('delete_employee deletes on v2', async () => {
    await tools.delete_employee.handler({ employeeId: 'abc' });
    expect(client.delete).toHaveBeenCalledWith('/employees/abc', 'v2');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/team.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/tools/team.ts`:

```typescript
import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

const DOC_URL = 'https://www.holded.com/es/desarrolladores/referencia-api';

/**
 * Team & HR tools backed by the Holded API v2 (Bearer auth, cursor
 * pagination). Registered only when a v2 API key is configured.
 */
export function getTeamTools(client: HoldedClient) {
  return {
    list_employees: {
      description:
        'List employees (Holded API v2, section Equipo y RRHH). Cursor-paginated: pass the previous response `nextCursor` as `cursor` to fetch the next page.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string } = {}) =>
        normalizeV2List(await client.get('/employees', cursorParams(args), 'v2')),
    },

    get_employee: {
      description: 'Get a single employee by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID (24-char hex ObjectId)' },
        },
        required: ['employeeId'],
      },
      readOnlyHint: true,
      handler: async (args: { employeeId: string }) =>
        client.get(`/employees/${args.employeeId}`, undefined, 'v2'),
    },

    create_employee: {
      description:
        `WRITE: creates a real employee record in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Empleados → Crear) for the payload fields (name, email, etc.).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Employee payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/employees', args.data, 'v2'),
    },

    update_employee: {
      description:
        `WRITE: updates a real employee record in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Empleados → Actualizar).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['employeeId', 'data'],
      },
      handler: async (args: { employeeId: string; data: Record<string, unknown> }) =>
        client.put(`/employees/${args.employeeId}`, args.data, 'v2'),
    },

    delete_employee: {
      description:
        'DESTRUCTIVE: permanently deletes an employee record in Holded (API v2). This cannot be undone.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
        },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.delete(`/employees/${args.employeeId}`, 'v2'),
    },

    get_employee_contract: {
      description: 'Get the contract details of an employee (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
        },
        required: ['employeeId'],
      },
      readOnlyHint: true,
      handler: async (args: { employeeId: string }) =>
        client.get(`/employees/${args.employeeId}/contract`, undefined, 'v2'),
    },

    update_employee_contract: {
      description:
        `WRITE: updates an employee's contract in Holded (API v2) — affects real HR/payroll data. ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Empleados → Actualizar contrato).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
          data: { type: 'object', description: 'Contract payload, sent verbatim as body' },
        },
        required: ['employeeId', 'data'],
      },
      handler: async (args: { employeeId: string; data: Record<string, unknown> }) =>
        client.put(`/employees/${args.employeeId}/contract`, args.data, 'v2'),
    },
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/tools/team.ts src/__tests__/team.test.ts
git commit -m "feat: add employee tools backed by holded api v2"
```

---

### Task 5: team.ts — time tracking tools (9)

**Files:**
- Modify: `src/tools/team.ts` (add keys to the object returned by `getTeamTools`)
- Test: `src/__tests__/team.test.ts` (append)

**Interfaces:**
- Produces: tool keys `clock_in_employee`, `clock_out_employee`, `pause_employee`, `unpause_employee`, `list_employee_times`, `get_employee_time`, `create_employee_time`, `update_employee_time`, `delete_employee_time` on the same `getTeamTools` object.

- [ ] **Step 1: Write the failing tests** — append to `src/__tests__/team.test.ts` (new `describe` block, same imports/beforeEach pattern as Task 4):

```typescript
describe('Team Tools — time tracking', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTeamTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTeamTools(client);
  });

  it('clock_in_employee posts to the clock-in action', async () => {
    await tools.clock_in_employee.handler({ employeeId: 'e1' });
    expect(client.post).toHaveBeenCalledWith('/employees/e1/clock-in', undefined, 'v2');
  });

  it('clock_out_employee posts to the clock-out action', async () => {
    await tools.clock_out_employee.handler({ employeeId: 'e1' });
    expect(client.post).toHaveBeenCalledWith('/employees/e1/clock-out', undefined, 'v2');
  });

  it('list_employee_times lists globally by default', async () => {
    (client.get as any).mockResolvedValue([]);
    await tools.list_employee_times.handler({});
    expect(client.get).toHaveBeenCalledWith('/employee-times', {}, 'v2');
  });

  it('list_employee_times scopes to one employee when employeeId is given', async () => {
    (client.get as any).mockResolvedValue([]);
    await tools.list_employee_times.handler({ employeeId: 'e1', limit: 5 });
    expect(client.get).toHaveBeenCalledWith('/employees/e1/times', { limit: 5 }, 'v2');
  });

  it('create_employee_time posts the record under the employee', async () => {
    const data = { start: '2026-07-01T09:00:00Z', end: '2026-07-01T17:00:00Z' };
    await tools.create_employee_time.handler({ employeeId: 'e1', data });
    expect(client.post).toHaveBeenCalledWith('/employees/e1/times', data, 'v2');
  });

  it('update/delete_employee_time address the time record directly', async () => {
    await tools.update_employee_time.handler({ timeId: 't1', data: { note: 'x' } });
    expect(client.put).toHaveBeenCalledWith('/employee-times/t1', { note: 'x' }, 'v2');

    await tools.delete_employee_time.handler({ timeId: 't1' });
    expect(client.delete).toHaveBeenCalledWith('/employee-times/t1', 'v2');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/team.test.ts` → FAIL (tools undefined).

- [ ] **Step 3: Implement** — add to the returned object in `getTeamTools` (after `update_employee_contract`):

```typescript
    clock_in_employee: {
      description:
        'WRITE: registers a clock-in for an employee in Holded time tracking (API v2). Affects real working-time records.',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/clock-in`, undefined, 'v2'),
    },

    clock_out_employee: {
      description:
        'WRITE: registers a clock-out for an employee in Holded time tracking (API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/clock-out`, undefined, 'v2'),
    },

    pause_employee: {
      description:
        'WRITE: starts a pause in the current working session of an employee (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/pause`, undefined, 'v2'),
    },

    unpause_employee: {
      description:
        'WRITE: ends the current pause of an employee working session (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { employeeId: { type: 'string', description: 'Employee ID' } },
        required: ['employeeId'],
      },
      handler: async (args: { employeeId: string }) =>
        client.post(`/employees/${args.employeeId}/unpause`, undefined, 'v2'),
    },

    list_employee_times: {
      description:
        'List time-tracking records (Holded API v2). Without `employeeId` lists all records (/employee-times); with `employeeId` lists only that employee (/employees/{id}/times). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Optional employee ID to scope the list' },
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { employeeId?: string; limit?: number; cursor?: string } = {}) => {
        const endpoint = args.employeeId ? `/employees/${args.employeeId}/times` : '/employee-times';
        return normalizeV2List(await client.get(endpoint, cursorParams(args), 'v2'));
      },
    },

    get_employee_time: {
      description: 'Get a single time-tracking record by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { timeId: { type: 'string', description: 'Time record ID' } },
        required: ['timeId'],
      },
      readOnlyHint: true,
      handler: async (args: { timeId: string }) =>
        client.get(`/employee-times/${args.timeId}`, undefined, 'v2'),
    },

    create_employee_time: {
      description:
        `WRITE: creates a manual time-tracking record for an employee (Holded API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Control horario → Crear registro).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          employeeId: { type: 'string', description: 'Employee ID' },
          data: { type: 'object', description: 'Time record payload, sent verbatim as body' },
        },
        required: ['employeeId', 'data'],
      },
      handler: async (args: { employeeId: string; data: Record<string, unknown> }) =>
        client.post(`/employees/${args.employeeId}/times`, args.data, 'v2'),
    },

    update_employee_time: {
      description:
        `WRITE: updates a time-tracking record (Holded API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Control horario → Actualizar).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          timeId: { type: 'string', description: 'Time record ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['timeId', 'data'],
      },
      handler: async (args: { timeId: string; data: Record<string, unknown> }) =>
        client.put(`/employee-times/${args.timeId}`, args.data, 'v2'),
    },

    delete_employee_time: {
      description:
        'DESTRUCTIVE: permanently deletes a time-tracking record in Holded (API v2). This cannot be undone.',
      inputSchema: {
        type: 'object' as const,
        properties: { timeId: { type: 'string', description: 'Time record ID' } },
        required: ['timeId'],
      },
      handler: async (args: { timeId: string }) =>
        client.delete(`/employee-times/${args.timeId}`, 'v2'),
    },
```

- [ ] **Step 4: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/tools/team.ts src/__tests__/team.test.ts
git commit -m "feat: add employee time tracking tools (holded api v2)"
```

---

### Task 6: team.ts — salary record tools (6)

**Files:**
- Modify: `src/tools/team.ts`
- Test: `src/__tests__/team.test.ts` (append)

**Interfaces:**
- Produces: tool keys `list_salary_records`, `get_salary_record`, `create_salary_record`, `update_salary_record`, `delete_salary_record`, `get_salary_record_defaults`.

- [ ] **Step 1: Verify the "defaults" endpoint route in the docs**

The individual GET (`/salary-records/{salaryRecordId}`, scope `accounting:payrolls.read`) is confirmed. The "Datos por defecto" route is not. Fetch https://www.holded.com/es/desarrolladores/referencia-api and locate the "Registros de nómina" subsection under "Equipo y RRHH"; note the exact route of the "Default data for creating records" endpoint. If it cannot be determined, use `GET /salary-records/defaults` and flag it in the tool description as unverified.

- [ ] **Step 2: Write the failing tests** — append to `src/__tests__/team.test.ts`:

```typescript
describe('Team Tools — salary records', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTeamTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTeamTools(client);
  });

  it('list_salary_records lists on v2 with cursor params', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_salary_records.handler({ limit: 20 });
    expect(client.get).toHaveBeenCalledWith('/salary-records', { limit: 20 }, 'v2');
  });

  it('get_salary_record fetches one record', async () => {
    await tools.get_salary_record.handler({ salaryRecordId: 's1' });
    expect(client.get).toHaveBeenCalledWith('/salary-records/s1', undefined, 'v2');
  });

  it('create/update/delete_salary_record hit the CRUD routes', async () => {
    const data = { employeeId: 'e1', lines: [] };
    await tools.create_salary_record.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/salary-records', data, 'v2');

    await tools.update_salary_record.handler({ salaryRecordId: 's1', data });
    expect(client.put).toHaveBeenCalledWith('/salary-records/s1', data, 'v2');

    await tools.delete_salary_record.handler({ salaryRecordId: 's1' });
    expect(client.delete).toHaveBeenCalledWith('/salary-records/s1', 'v2');
  });
});
```

If Step 1 found a defaults route, add:

```typescript
  it('get_salary_record_defaults fetches the defaults', async () => {
    await tools.get_salary_record_defaults.handler({});
    expect(client.get).toHaveBeenCalledWith('/salary-records/defaults', undefined, 'v2');
  });
```

(adjust the expected route to what Step 1 found).

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/__tests__/team.test.ts` → FAIL.

- [ ] **Step 4: Implement** — add to `getTeamTools`:

```typescript
    list_salary_records: {
      description:
        'List payroll salary records (Holded API v2, requires scope accounting:payrolls.read). Each record has employee info, earnings/deductions lines, totals and payment status (PENDING, PAID, PARTIALLY_PAID). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string } = {}) =>
        normalizeV2List(await client.get('/salary-records', cursorParams(args), 'v2')),
    },

    get_salary_record: {
      description:
        'Get a payroll salary record by ID (Holded API v2, scope accounting:payrolls.read). Returns line-by-line earnings and deductions, accounting accounts, totals and payment status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          salaryRecordId: { type: 'string', description: 'Salary record ID (24-char hex)' },
        },
        required: ['salaryRecordId'],
      },
      readOnlyHint: true,
      handler: async (args: { salaryRecordId: string }) =>
        client.get(`/salary-records/${args.salaryRecordId}`, undefined, 'v2'),
    },

    create_salary_record: {
      description:
        `WRITE: creates a real payroll record in Holded (API v2) — affects accounting and HR data. ` +
        `Use get_salary_record_defaults first to obtain a valid base payload. ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Registros de nómina → Crear).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Salary record payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/salary-records', args.data, 'v2'),
    },

    update_salary_record: {
      description:
        `WRITE: updates a payroll record in Holded (API v2) — affects accounting and HR data. ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Registros de nómina → Actualizar).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          salaryRecordId: { type: 'string', description: 'Salary record ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['salaryRecordId', 'data'],
      },
      handler: async (args: { salaryRecordId: string; data: Record<string, unknown> }) =>
        client.put(`/salary-records/${args.salaryRecordId}`, args.data, 'v2'),
    },

    delete_salary_record: {
      description:
        'DESTRUCTIVE: permanently deletes a payroll record in Holded (API v2). This cannot be undone and affects accounting data.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          salaryRecordId: { type: 'string', description: 'Salary record ID' },
        },
        required: ['salaryRecordId'],
      },
      handler: async (args: { salaryRecordId: string }) =>
        client.delete(`/salary-records/${args.salaryRecordId}`, 'v2'),
    },

    get_salary_record_defaults: {
      description:
        'Get the default data for creating a payroll record (Holded API v2). Useful as a base payload for create_salary_record.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      readOnlyHint: true,
      handler: async () => client.get('/salary-records/defaults', undefined, 'v2'),
    },
```

(Use the route confirmed in Step 1 for `get_salary_record_defaults`; if unverified, keep `/salary-records/defaults` and append "(route inferred from docs navigation; may change)" to its description.)

- [ ] **Step 5: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/team.ts src/__tests__/team.test.ts
git commit -m "feat: add payroll salary record tools (holded api v2)"
```

---

### Task 7: ledger.ts — accounting write tools (4)

**Files:**
- Create: `src/tools/ledger.ts`
- Test: `src/__tests__/ledger.test.ts` (create)

**Interfaces:**
- Produces: `getLedgerTools(client: HoldedClient)` with keys `list_ledger_entries`, `create_ledger_entry`, `list_accounting_accounts`, `create_accounting_account`. Names deliberately distinct from v1 tools `get_chart_of_accounts` / `get_daily_ledger` (which stay untouched).

- [ ] **Step 1: Write the failing tests** — create `src/__tests__/ledger.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getLedgerTools } from '../tools/ledger.js';

describe('Ledger Tools (api v2)', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getLedgerTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getLedgerTools(client);
  });

  it('list_ledger_entries lists on v2 with cursor params', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_ledger_entries.handler({ limit: 100 });
    expect(client.get).toHaveBeenCalledWith('/ledger-entries', { limit: 100 }, 'v2');
  });

  it('create_ledger_entry posts the entry verbatim', async () => {
    const data = { date: '2026-06-30', lines: [{ account: '6400000000', debit: 100 }] };
    await tools.create_ledger_entry.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/ledger-entries', data, 'v2');
  });

  it('list_accounting_accounts lists on v2', async () => {
    (client.get as any).mockResolvedValue([]);
    await tools.list_accounting_accounts.handler({});
    expect(client.get).toHaveBeenCalledWith('/accounting-accounts', {}, 'v2');
  });

  it('create_accounting_account posts on v2', async () => {
    const data = { num: '6290000001', name: 'Otros servicios' };
    await tools.create_accounting_account.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/accounting-accounts', data, 'v2');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/ledger.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/tools/ledger.ts`:

```typescript
import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

const DOC_URL = 'https://www.holded.com/es/desarrolladores/referencia-api';

/**
 * Accounting write tools backed by the Holded API v2. Complements the
 * read-only v1 tools (get_chart_of_accounts, get_daily_ledger), which are
 * kept untouched. Registered only when a v2 API key is configured.
 */
export function getLedgerTools(client: HoldedClient) {
  return {
    list_ledger_entries: {
      description:
        'List journal/ledger entries (Holded API v2). Cursor-paginated: pass the previous response `nextCursor` as `cursor`. For the v1 read-only daily ledger see get_daily_ledger.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string } = {}) =>
        normalizeV2List(await client.get('/ledger-entries', cursorParams(args), 'v2')),
    },

    create_ledger_entry: {
      description:
        `WRITE: creates a real journal entry in Holded accounting (API v2). Incorrect entries directly distort the company books — double-check accounts and amounts. ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Contabilidad → Crear asiento).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Journal entry payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/ledger-entries', args.data, 'v2'),
    },

    list_accounting_accounts: {
      description:
        'List accounting accounts (Holded API v2). Cursor-paginated. For the v1 read-only chart of accounts see get_chart_of_accounts.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string } = {}) =>
        normalizeV2List(await client.get('/accounting-accounts', cursorParams(args), 'v2')),
    },

    create_accounting_account: {
      description:
        `WRITE: creates a real accounting account in the Holded chart of accounts (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Contabilidad → Crear cuenta).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Account payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/accounting-accounts', args.data, 'v2'),
    },
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/tools/ledger.ts src/__tests__/ledger.test.ts
git commit -m "feat: add ledger entry and accounting account tools (holded api v2)"
```

---

### Task 8: treasury-v2.ts — bank accounts and movements (10)

**Files:**
- Create: `src/tools/treasury-v2.ts`
- Test: `src/__tests__/treasury-v2.test.ts` (create)

**Interfaces:**
- Produces: `getTreasuryV2Tools(client: HoldedClient)` with keys `list_bank_accounts`, `get_bank_account`, `create_bank_account`, `update_bank_account`, `delete_bank_account`, `archive_bank_account`, `list_bank_movements`, `create_bank_movement`, `reconcile_bank_movement`, `list_cash_movements`. Task 9 adds the forecast keys to this same object.

- [ ] **Step 1: Write the failing tests** — create `src/__tests__/treasury-v2.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTreasuryV2Tools } from '../tools/treasury-v2.js';

describe('Treasury v2 Tools — bank accounts & movements', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTreasuryV2Tools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTreasuryV2Tools(client);
  });

  it('list_bank_accounts lists on v2', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_bank_accounts.handler({});
    expect(client.get).toHaveBeenCalledWith('/treasury/accounts', {}, 'v2');
  });

  it('bank account CRUD and archive hit the right routes', async () => {
    await tools.get_bank_account.handler({ accountId: 'a1' });
    expect(client.get).toHaveBeenCalledWith('/treasury/accounts/a1', undefined, 'v2');

    const data = { name: 'BBVA operativa' };
    await tools.create_bank_account.handler({ data });
    expect(client.post).toHaveBeenCalledWith('/treasury/accounts', data, 'v2');

    await tools.update_bank_account.handler({ accountId: 'a1', data });
    expect(client.put).toHaveBeenCalledWith('/treasury/accounts/a1', data, 'v2');

    await tools.delete_bank_account.handler({ accountId: 'a1' });
    expect(client.delete).toHaveBeenCalledWith('/treasury/accounts/a1', 'v2');

    await tools.archive_bank_account.handler({ accountId: 'a1' });
    expect(client.post).toHaveBeenCalledWith('/treasury/accounts/a1/archive', undefined, 'v2');
  });

  it('movement tools address the account subresources', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_bank_movements.handler({ accountId: 'a1', limit: 50 });
    expect(client.get).toHaveBeenCalledWith(
      '/treasury/accounts/a1/bank-movements',
      { limit: 50 },
      'v2'
    );

    const data = { amount: -120.5, concept: 'AWS June' };
    await tools.create_bank_movement.handler({ accountId: 'a1', data });
    expect(client.post).toHaveBeenCalledWith('/treasury/accounts/a1/bank-movements', data, 'v2');

    await tools.reconcile_bank_movement.handler({ accountId: 'a1', movementId: 'm1', data: {} });
    expect(client.post).toHaveBeenCalledWith(
      '/treasury/accounts/a1/bank-movements/m1/reconcile',
      {},
      'v2'
    );

    await tools.list_cash_movements.handler({ accountId: 'a1' });
    expect(client.get).toHaveBeenCalledWith('/treasury/accounts/a1/cash-movements', {}, 'v2');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/treasury-v2.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/tools/treasury-v2.ts`:

```typescript
import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

const DOC_URL = 'https://www.holded.com/es/desarrolladores/referencia-api';

/**
 * Official treasury tools backed by the Holded API v2 (bank accounts,
 * movements, reconciliation, invoicing forecasts). Supersedes the
 * experimental internal-API banking tools (banking.ts), which are kept as-is
 * for now. Registered only when a v2 API key is configured.
 */
export function getTreasuryV2Tools(client: HoldedClient) {
  return {
    list_bank_accounts: {
      description:
        'List treasury bank accounts (Holded API v2, official endpoint). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string } = {}) =>
        normalizeV2List(await client.get('/treasury/accounts', cursorParams(args), 'v2')),
    },

    get_bank_account: {
      description: 'Get a treasury bank account by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { accountId: { type: 'string', description: 'Bank account ID' } },
        required: ['accountId'],
      },
      readOnlyHint: true,
      handler: async (args: { accountId: string }) =>
        client.get(`/treasury/accounts/${args.accountId}`, undefined, 'v2'),
    },

    create_bank_account: {
      description:
        `WRITE: creates a real treasury bank account in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Crear cuenta).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Bank account payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/treasury/accounts', args.data, 'v2'),
    },

    update_bank_account: {
      description:
        `WRITE: updates a treasury bank account in Holded (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Actualizar cuenta).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['accountId', 'data'],
      },
      handler: async (args: { accountId: string; data: Record<string, unknown> }) =>
        client.put(`/treasury/accounts/${args.accountId}`, args.data, 'v2'),
    },

    delete_bank_account: {
      description:
        'DESTRUCTIVE: permanently deletes a treasury bank account in Holded (API v2). Prefer archive_bank_account to keep history. This cannot be undone.',
      inputSchema: {
        type: 'object' as const,
        properties: { accountId: { type: 'string', description: 'Bank account ID' } },
        required: ['accountId'],
      },
      handler: async (args: { accountId: string }) =>
        client.delete(`/treasury/accounts/${args.accountId}`, 'v2'),
    },

    archive_bank_account: {
      description:
        'WRITE: archives a treasury bank account in Holded (API v2). Reversible alternative to delete_bank_account.',
      inputSchema: {
        type: 'object' as const,
        properties: { accountId: { type: 'string', description: 'Bank account ID' } },
        required: ['accountId'],
      },
      handler: async (args: { accountId: string }) =>
        client.post(`/treasury/accounts/${args.accountId}/archive`, undefined, 'v2'),
    },

    list_bank_movements: {
      description:
        'List bank movements of a treasury account (Holded API v2, official endpoint — replaces the experimental internal banking tools). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: ['accountId'],
      },
      readOnlyHint: true,
      handler: async (args: { accountId: string; limit?: number; cursor?: string }) =>
        normalizeV2List(
          await client.get(
            `/treasury/accounts/${args.accountId}/bank-movements`,
            cursorParams(args),
            'v2'
          )
        ),
    },

    create_bank_movement: {
      description:
        `WRITE: creates a real bank movement in a treasury account (Holded API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Crear movimiento).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          data: { type: 'object', description: 'Movement payload, sent verbatim as body' },
        },
        required: ['accountId', 'data'],
      },
      handler: async (args: { accountId: string; data: Record<string, unknown> }) =>
        client.post(`/treasury/accounts/${args.accountId}/bank-movements`, args.data, 'v2'),
    },

    reconcile_bank_movement: {
      description:
        `WRITE: reconciles a bank movement against documents/entries (Holded API v2, official endpoint — replaces the experimental reconcile_bank_movement from the internal API when v2 is enabled). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Conciliar).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Bank account ID' },
          movementId: { type: 'string', description: 'Bank movement ID' },
          data: { type: 'object', description: 'Reconciliation payload, sent verbatim as body' },
        },
        required: ['accountId', 'movementId', 'data'],
      },
      handler: async (args: {
        accountId: string;
        movementId: string;
        data: Record<string, unknown>;
      }) =>
        client.post(
          `/treasury/accounts/${args.accountId}/bank-movements/${args.movementId}/reconcile`,
          args.data,
          'v2'
        ),
    },

    list_cash_movements: {
      description:
        'List cash movements of a treasury account (Holded API v2). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: { type: 'string', description: 'Treasury account ID' },
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: ['accountId'],
      },
      readOnlyHint: true,
      handler: async (args: { accountId: string; limit?: number; cursor?: string }) =>
        normalizeV2List(
          await client.get(
            `/treasury/accounts/${args.accountId}/cash-movements`,
            cursorParams(args),
            'v2'
          )
        ),
    },
  };
}
```

**Naming conflict check:** `banking.ts` (experimental, only registered when `HOLDED_ENABLE_EXPERIMENTAL_BANKING=true`) may already define a `reconcile_bank_movement` tool. Run `grep -n "reconcile" src/tools/banking.ts`. If the name collides, rename the banking.ts key is NOT allowed (breaking change) — instead name the v2 tool `reconcile_bank_movement_v2`? No: prefer keeping the clean name on v2 and renaming is avoided by checking first. If there is a collision, name the v2 tool `reconcile_treasury_movement` and update the test accordingly; note the final name in the commit message.

- [ ] **Step 4: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/tools/treasury-v2.ts src/__tests__/treasury-v2.test.ts
git commit -m "feat: add official treasury bank account and movement tools (holded api v2)"
```

---

### Task 9: treasury-v2.ts — invoicing forecasts (5)

**Files:**
- Modify: `src/tools/treasury-v2.ts`
- Test: `src/__tests__/treasury-v2.test.ts` (append)

**Interfaces:**
- Produces: tool keys `list_invoicing_forecasts`, `get_invoicing_forecast`, `create_invoicing_forecast`, `update_invoicing_forecast`, `delete_invoicing_forecast` on `getTreasuryV2Tools`.

- [ ] **Step 1: Write the failing tests** — append to `src/__tests__/treasury-v2.test.ts`:

```typescript
describe('Treasury v2 Tools — invoicing forecasts', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTreasuryV2Tools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTreasuryV2Tools(client);
  });

  const BASE = '/treasury/cashflow/invoicing-forecasts';

  it('forecast CRUD hits the cashflow routes', async () => {
    (client.get as any).mockResolvedValue({ items: [] });
    await tools.list_invoicing_forecasts.handler({});
    expect(client.get).toHaveBeenCalledWith(BASE, {}, 'v2');

    await tools.get_invoicing_forecast.handler({ forecastId: 'f1' });
    expect(client.get).toHaveBeenCalledWith(`${BASE}/f1`, undefined, 'v2');

    const data = { amount: 5000, date: '2026-08-01' };
    await tools.create_invoicing_forecast.handler({ data });
    expect(client.post).toHaveBeenCalledWith(BASE, data, 'v2');

    await tools.update_invoicing_forecast.handler({ forecastId: 'f1', data });
    expect(client.put).toHaveBeenCalledWith(`${BASE}/f1`, data, 'v2');

    await tools.delete_invoicing_forecast.handler({ forecastId: 'f1' });
    expect(client.delete).toHaveBeenCalledWith(`${BASE}/f1`, 'v2');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/treasury-v2.test.ts` → FAIL.

- [ ] **Step 3: Implement** — add to `getTreasuryV2Tools` (after `list_cash_movements`):

```typescript
    list_invoicing_forecasts: {
      description:
        'List cashflow invoicing forecasts (Holded API v2). Cursor-paginated.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { limit?: number; cursor?: string } = {}) =>
        normalizeV2List(
          await client.get('/treasury/cashflow/invoicing-forecasts', cursorParams(args), 'v2')
        ),
    },

    get_invoicing_forecast: {
      description: 'Get a cashflow invoicing forecast by ID (Holded API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { forecastId: { type: 'string', description: 'Forecast ID' } },
        required: ['forecastId'],
      },
      readOnlyHint: true,
      handler: async (args: { forecastId: string }) =>
        client.get(`/treasury/cashflow/invoicing-forecasts/${args.forecastId}`, undefined, 'v2'),
    },

    create_invoicing_forecast: {
      description:
        `WRITE: creates an invoicing forecast in Holded cashflow (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Previsiones).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          data: { type: 'object', description: 'Forecast payload, sent verbatim as body' },
        },
        required: ['data'],
      },
      handler: async (args: { data: Record<string, unknown> }) =>
        client.post('/treasury/cashflow/invoicing-forecasts', args.data, 'v2'),
    },

    update_invoicing_forecast: {
      description:
        `WRITE: updates an invoicing forecast in Holded cashflow (API v2). ` +
        `\`data\` is sent verbatim as the request body — see ${DOC_URL} (Tesorería → Previsiones).`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          forecastId: { type: 'string', description: 'Forecast ID' },
          data: { type: 'object', description: 'Fields to update, sent verbatim as body' },
        },
        required: ['forecastId', 'data'],
      },
      handler: async (args: { forecastId: string; data: Record<string, unknown> }) =>
        client.put(`/treasury/cashflow/invoicing-forecasts/${args.forecastId}`, args.data, 'v2'),
    },

    delete_invoicing_forecast: {
      description:
        'DESTRUCTIVE: permanently deletes an invoicing forecast in Holded cashflow (API v2).',
      inputSchema: {
        type: 'object' as const,
        properties: { forecastId: { type: 'string', description: 'Forecast ID' } },
        required: ['forecastId'],
      },
      handler: async (args: { forecastId: string }) =>
        client.delete(`/treasury/cashflow/invoicing-forecasts/${args.forecastId}`, 'v2'),
    },
```

- [ ] **Step 4: Run tests** — `npx vitest run` → ALL PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/tools/treasury-v2.ts src/__tests__/treasury-v2.test.ts
git commit -m "feat: add invoicing forecast tools (holded api v2)"
```

---

### Task 10: Conditional registration in index.ts + rate limits

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `getTeamTools` (Tasks 4–6), `getLedgerTools` (Task 7), `getTreasuryV2Tools` (Tasks 8–9), `client.hasV2()` (Task 1).

- [ ] **Step 1: Implement registration**

Add imports after the existing tool imports in `src/index.ts`:

```typescript
import { getTeamTools } from './tools/team.js';
import { getLedgerTools } from './tools/ledger.js';
import { getTreasuryV2Tools } from './tools/treasury-v2.js';
```

In the `allTools` object, after the banking line:

```typescript
  // API v2 tools: only registered when the tenant has a v2 key configured
  // (HOLDED_API_KEY_V2 / TENANT_N_API_KEY_V2). Existing v1 users see no change.
  ...(client.hasV2() ? getTeamTools(client) : {}),
  ...(client.hasV2() ? getLedgerTools(client) : {}),
  ...(client.hasV2() ? getTreasuryV2Tools(client) : {}),
```

In the `tenantTools` object inside the CallTool handler, after the banking line:

```typescript
    ...(tenantContext.client.hasV2() ? getTeamTools(tenantContext.client) : {}),
    ...(tenantContext.client.hasV2() ? getLedgerTools(tenantContext.client) : {}),
    ...(tenantContext.client.hasV2() ? getTreasuryV2Tools(tenantContext.client) : {}),
```

Add stricter rate limits to the `toolLimits` map in the `RateLimiter` constructor:

```typescript
    // v2 write/destructive operations
    create_employee: { maxRequests: 20, windowMs: 60000 },
    delete_employee: { maxRequests: 10, windowMs: 60000 },
    create_salary_record: { maxRequests: 20, windowMs: 60000 },
    delete_salary_record: { maxRequests: 10, windowMs: 60000 },
    create_ledger_entry: { maxRequests: 20, windowMs: 60000 },
    create_bank_movement: { maxRequests: 20, windowMs: 60000 },
    delete_bank_account: { maxRequests: 10, windowMs: 60000 },
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npx vitest run` → ALL PASS.

Smoke-test registration manually:

```bash
npm run build
# The built server must list v2 tools only when the v2 key is set.
(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'; sleep 1) | HOLDED_API_KEY=dummy node dist/index.js 2>/dev/null | grep -c list_employees
# Expected: 0
(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'; sleep 1) | HOLDED_API_KEY=dummy HOLDED_API_KEY_V2=sk_live_dummy node dist/index.js 2>/dev/null | grep -c list_employees
# Expected: 1
```

(If the raw-stdio smoke test is flaky in your environment, verifying via `npx tsc --noEmit` + unit tests is sufficient; note it in the commit.)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register api v2 tools conditionally on v2 key presence

- Team/HR, ledger and treasury v2 tools appear only when
  HOLDED_API_KEY_V2 (or TENANT_N_API_KEY_V2) is configured
- Stricter rate limits for v2 write/destructive operations"
```

---

### Task 11: README and docs

**Files:**
- Modify: `README.md`
- Check: `.env.example` (update if it exists: `ls .env.example`)

- [ ] **Step 1: Add a v2 section to README.md**

Locate the configuration/env-var section of the README and add `HOLDED_API_KEY_V2` next to `HOLDED_API_KEY`. Then add a new section (after the existing tools tables, matching the README's current heading style and language):

```markdown
## Holded API v2 (Team/HR, Ledger, Treasury)

Holded released its unified API v2 in June 2026 (Bearer auth, scoped keys,
cursor pagination). This server keeps all existing tools on the stable v1
APIs and uses v2 **only** for modules v1 does not cover.

### Setup

1. In Holded go to **Settings → API** and generate a v2 key (`sk_live_…`)
   with the scopes you need (e.g. `accounting:payrolls.read`).
2. Set the environment variable:
   - Single tenant: `HOLDED_API_KEY_V2=sk_live_…`
   - Multi-tenant: `TENANT_1_API_KEY_V2=sk_live_…` (per tenant)

Without this variable the v2 tools are not registered and nothing changes
for existing users. A `403` response means the key is missing a scope.

### v2 tools

| Module | Tools |
|--------|-------|
| Employees | `list_employees`, `get_employee`, `create_employee`, `update_employee`, `delete_employee`, `get_employee_contract`, `update_employee_contract` |
| Time tracking | `clock_in_employee`, `clock_out_employee`, `pause_employee`, `unpause_employee`, `list_employee_times`, `get_employee_time`, `create_employee_time`, `update_employee_time`, `delete_employee_time` |
| Payroll | `list_salary_records`, `get_salary_record`, `create_salary_record`, `update_salary_record`, `delete_salary_record`, `get_salary_record_defaults` |
| Ledger | `list_ledger_entries`, `create_ledger_entry`, `list_accounting_accounts`, `create_accounting_account` |
| Treasury | `list_bank_accounts`, `get_bank_account`, `create_bank_account`, `update_bank_account`, `delete_bank_account`, `archive_bank_account`, `list_bank_movements`, `create_bank_movement`, `reconcile_bank_movement`, `list_cash_movements`, `list_invoicing_forecasts`, `get_invoicing_forecast`, `create_invoicing_forecast`, `update_invoicing_forecast`, `delete_invoicing_forecast` |

**Write safety:** create/update/delete tools in these modules modify real
HR, accounting and treasury data. List/get tools are read-only. The official
treasury tools supersede the experimental internal banking tools
(`HOLDED_ENABLE_EXPERIMENTAL_BANKING`), which remain available unchanged.
```

Adjust the tool names in the table if any were renamed during Task 8's conflict check. If the README documents write-safety elsewhere, extend that section instead of duplicating it.

- [ ] **Step 2: Update `.env.example` if present**

```bash
ls .env.example 2>/dev/null && echo present || echo absent
```

If present, add under the existing key:

```bash
# Optional: Holded API v2 key (sk_live_…) for Team/HR, ledger and treasury v2 tools
# HOLDED_API_KEY_V2=
```

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example 2>/dev/null || git add README.md
git commit -m "docs: document holded api v2 support and HOLDED_API_KEY_V2"
```

---

### Task 12: Final verification

- [ ] **Step 1: Full check**

```bash
npm run build && npm run lint && npm run test
```

Expected: build clean, lint clean, all tests pass.

- [ ] **Step 2: Review the diff against the spec**

```bash
git diff main --stat
```

Confirm: no changes to existing v1 tool files (`documents.ts`, `contacts.ts`, `banking.ts`, etc.) beyond none at all; only the files listed in this plan changed.

- [ ] **Step 3: STOP — do not push**

Per the repo owner's workflow, pushing and opening the PR require explicit user approval. Report completion and wait.
