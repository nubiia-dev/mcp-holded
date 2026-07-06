import { HoldedClient } from '../holded-client.js';
import { dailyLedgerSchema, withValidation } from '../validation.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

/**
 * Read-only tools backed by the Holded **Accounting** API, now migrated to
 * **API v2** endpoints (`https://api.holded.com/api/v2`).
 *
 * - `get_chart_of_accounts` → `GET /accounting-accounts` (cursor-paginated, optional filters)
 * - `get_daily_ledger`      → `GET /ledger-entries`      (cursor-paginated, ISO date params required)
 *
 * The v2 `list_accounting_accounts` and `list_ledger_entries` tools in `ledger.ts`
 * share the same endpoints. Consolidation into a single tool pair is planned for
 * release 2.1.
 *
 * The API is read-only — Holded exposes no endpoint to create/edit/delete manual
 * journal entries (asientos) — so no mutating tools are provided here.
 */

/**
 * Convert a Unix-seconds timestamp or an ISO date string into an ISO date string
 * (`YYYY-MM-DD`). Returns `undefined` when `value` is `undefined`.
 *
 * Used to give `get_daily_ledger` backward-compatibility with the legacy
 * `starttmp`/`endtmp` Unix-timestamp arguments while the v2 API requires ISO dates.
 */
function toIsoDate(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10);
  return value;
}

/** A single line of the daily ledger as returned by the Accounting API. */
interface LedgerLine extends Record<string, unknown> {
  entryNumber?: number;
  line?: number;
  timestamp?: number;
  type?: string;
  description?: string;
  account?: number;
  debit?: number;
  credit?: number;
}

/** A grouped journal entry: all lines that share an `entryNumber`. */
interface LedgerEntry {
  entryNumber?: number;
  timestamp?: number;
  type?: string;
  description?: string;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
}

/**
 * Group flat ledger lines into double-entry journal entries keyed by
 * `entryNumber`, preserving first-seen order and summing debit/credit so each
 * entry can be checked for balance.
 *
 * @param lines - Flat ledger lines from the current cursor page.
 * @returns One {@link LedgerEntry} per distinct `entryNumber`.
 */
function groupLedgerByEntry(lines: LedgerLine[]): LedgerEntry[] {
  const byEntry = new Map<number | string, LedgerEntry>();
  for (const line of lines) {
    const key = line.entryNumber ?? `__ungrouped_${byEntry.size}`;
    let entry = byEntry.get(key);
    if (!entry) {
      entry = {
        entryNumber: line.entryNumber,
        timestamp: line.timestamp,
        type: line.type,
        description: line.description,
        lines: [],
        totalDebit: 0,
        totalCredit: 0,
      };
      byEntry.set(key, entry);
    }
    entry.lines.push(line);
    // Round after each addition to avoid IEEE-754 drift accumulating across lines —
    // these totals are used to check that an entry balances (debit === credit).
    entry.totalDebit = Math.round((entry.totalDebit + (line.debit ?? 0)) * 100) / 100;
    entry.totalCredit = Math.round((entry.totalCredit + (line.credit ?? 0)) * 100) / 100;
  }
  return Array.from(byEntry.values());
}

export function getAccountingTools(client: HoldedClient) {
  return {
    // ── Chart of accounts ──────────────────────────────────────────────────
    get_chart_of_accounts: {
      description:
        'Get accounting accounts (Holded API v2, GET /accounting-accounts). ' +
        'Returns every account with `num` (PGC number, e.g. 40000000), `name`, `group`, `debit`, `credit`, and `balance`. ' +
        'Unlike `list_expenses_accounts` (group-6 only), this includes all groups (assets, liabilities, income, expenses). ' +
        'Cursor-paginated: pass `nextCursor` from the previous response as `cursor`. ' +
        'Optional annex filters: `archived` (include archived accounts), `start_date`/`end_date` (ISO 8601, filter by activity period), `include_empty` (include zero-balance accounts). ' +
        'See also: `list_accounting_accounts` in ledger tools — both tools target the same v2 endpoint; consolidation is planned for release 2.1. ' +
        'Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: {
            type: 'string',
            description: 'Cursor token from a previous response nextCursor',
          },
          archived: { type: 'boolean', description: 'Include archived accounts (default: false)' },
          start_date: { type: 'string', description: 'Filter start date (ISO 8601, YYYY-MM-DD)' },
          end_date: { type: 'string', description: 'Filter end date (ISO 8601, YYYY-MM-DD)' },
          include_empty: {
            type: 'boolean',
            description: 'Include zero-balance accounts (default: false)',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: {
          limit?: number;
          cursor?: string;
          archived?: boolean;
          start_date?: string;
          end_date?: string;
          include_empty?: boolean;
        } = {}
      ) => {
        // Build params; booleans serialised as "true"/"false" strings — the
        // standard REST/URL-query-param convention for boolean filters.
        const params: Record<string, string | number> = {};
        if (args.limit !== undefined) params.limit = args.limit;
        if (args.cursor !== undefined) params.cursor = args.cursor;
        if (args.archived !== undefined) params.archived = String(args.archived);
        if (args.start_date !== undefined) params.start_date = args.start_date;
        if (args.end_date !== undefined) params.end_date = args.end_date;
        if (args.include_empty !== undefined) params.include_empty = String(args.include_empty);
        return normalizeV2List(await client.get('/accounting-accounts', params));
      },
    },

    // ── Daily ledger / journal ─────────────────────────────────────────────
    get_daily_ledger: {
      description:
        'Get ledger entries / journal (asientos) for a date range (Holded API v2, GET /ledger-entries). ' +
        'Returns one row per ledger line with entryNumber, line, timestamp, type (collect/payment/purchase/…), description, account (PGC num), debit, and credit. ' +
        'This is the authoritative source for balance-sheet and tax-return figures. ' +
        '\n\nDate arguments (at least one form of each bound is required — the v2 API returns 422 without both):\n' +
        '  • Primary form  : `start_date` / `end_date` — ISO 8601 date strings (YYYY-MM-DD)\n' +
        '  • Legacy form   : `starttmp` / `endtmp` — Unix timestamps in seconds; converted automatically to ISO\n' +
        '\nIf both forms are supplied for the same bound, the ISO string takes precedence.\n' +
        '\nCursor-paginated: pass `nextCursor` from a previous response as `cursor` to retrieve subsequent pages. ' +
        'Large date ranges may require multiple pages. ' +
        'Set `groupByEntry` to nest lines into full double-entry entries with per-entry debit/credit totals (applied page-scoped). ' +
        '\nSee also: `list_ledger_entries` in ledger tools — both tools target the same v2 endpoint. ' +
        'Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          start_date: {
            type: 'string',
            description:
              'Range start as an ISO 8601 date (YYYY-MM-DD, inclusive). Required unless starttmp is provided.',
          },
          end_date: {
            type: 'string',
            description:
              'Range end as an ISO 8601 date (YYYY-MM-DD, inclusive). Required unless endtmp is provided.',
          },
          starttmp: {
            type: 'number',
            description:
              'Range start as a Unix timestamp in seconds (legacy form, converted to ISO). Use start_date when possible.',
          },
          endtmp: {
            type: 'number',
            description:
              'Range end as a Unix timestamp in seconds (legacy form, converted to ISO). Use end_date when possible.',
          },
          groupByEntry: {
            type: 'boolean',
            description:
              'Group lines by entryNumber into full journal entries (each with totalDebit/totalCredit), applied to the current page. Default: false (flat lines)',
          },
          limit: {
            type: 'number',
            description:
              'Max items per cursor page (server-paginated; use limit to control page size)',
          },
          cursor: {
            type: 'string',
            description: 'Cursor token from a previous response nextCursor',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: withValidation(dailyLedgerSchema, async (args) => {
        // Resolve start/end: ISO form takes priority; fall back to Unix→ISO conversion
        const startDate = args.start_date ?? toIsoDate(args.starttmp as number | undefined);
        const endDate = args.end_date ?? toIsoDate(args.endtmp as number | undefined);

        if (!startDate || !endDate) {
          throw new Error(
            'get_daily_ledger requires start_date and end_date (ISO) — the Holded API v2 returns 422 without them'
          );
        }

        const params: Record<string, string | number> = {
          start_date: startDate,
          end_date: endDate,
          ...cursorParams({ limit: args.limit, cursor: args.cursor }),
        };

        const response = await client.get('/ledger-entries', params);
        const normalized = normalizeV2List(response);

        if (args.groupByEntry) {
          return {
            ...normalized,
            items: groupLedgerByEntry(normalized.items as LedgerLine[]),
          };
        }
        return normalized;
      }),
    },
  };
}
