import { HoldedClient } from '../holded-client.js';
import { dailyLedgerSchema, withValidation } from '../validation.js';

/**
 * Read-only tools backed by the Holded **Accounting** API
 * (`https://api.holded.com/api/accounting/v1`).
 *
 * The accounting layer is the authoritative source for balance-sheet / annual
 * accounts figures: the document (invoicing) layer is decoupled from it. The
 * API is read-only — Holded exposes no endpoint to create/edit/delete manual
 * journal entries (asientos) — so no mutating tools are provided here.
 */

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
 * @param lines - Flat ledger lines from `/dailyledger`.
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
    entry.totalDebit += line.debit ?? 0;
    entry.totalCredit += line.credit ?? 0;
  }
  return Array.from(byEntry.values());
}

export function getAccountingTools(client: HoldedClient) {
  return {
    // Chart of accounts (active fiscal year)
    get_chart_of_accounts: {
      description:
        'Get the full chart of accounts for the ACTIVE fiscal year (Accounting API). Returns every account with `num` (PGC number, e.g. 40000000), `name`, `group`, `debit`, `credit`, and `balance`. Unlike list_expenses_accounts (group-6 only), this includes all groups (assets, liabilities, income, expenses). Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      readOnlyHint: true,
      handler: async () => {
        return client.get('/chartofaccounts', undefined, 'accounting');
      },
    },

    // Daily ledger / journal
    get_daily_ledger: {
      description:
        'Get the daily ledger (journal / asientos) between two Unix timestamps (Accounting API). Returns one row per ledger line with entryNumber, line, timestamp, type (collect/payment/purchase/...), description, account (PGC num), debit, and credit. This is the authoritative source for balance-sheet and tax-return figures. Range must not exceed 1 year. Set groupByEntry to nest lines into full double-entry entries with per-entry debit/credit totals. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          starttmp: {
            type: 'number',
            description: 'Range start as a Unix timestamp in seconds (inclusive)',
          },
          endtmp: {
            type: 'number',
            description: 'Range end as a Unix timestamp in seconds (inclusive)',
          },
          groupByEntry: {
            type: 'boolean',
            description:
              'Group lines by entryNumber into full journal entries (each with totalDebit/totalCredit). Default: false (flat lines)',
          },
        },
        required: ['starttmp', 'endtmp'],
      },
      readOnlyHint: true,
      handler: withValidation(dailyLedgerSchema, async (args) => {
        const lines = (await client.get(
          '/dailyledger',
          { starttmp: args.starttmp, endtmp: args.endtmp },
          'accounting'
        )) as LedgerLine[];
        if (args.groupByEntry) {
          return groupLedgerByEntry(lines);
        }
        return lines;
      }),
    },
  };
}
