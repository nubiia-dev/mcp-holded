import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

const DOC_URL = 'https://www.holded.com/es/desarrolladores/referencia-api';

/**
 * List ledger entries and chart of accounts using the Holded API v2.
 * Complements the read-only tools `get_chart_of_accounts` and `get_daily_ledger`,
 * both migrated to v2 endpoints (`/accounting-accounts`, `/ledger-entries`) in 2.0.
 * Consolidation into a single tool pair is planned for release 2.1.
 * Registered only when a v2 API key is configured.
 */
export function getLedgerTools(client: HoldedClient) {
  return {
    list_ledger_entries: {
      description:
        'List journal/ledger entries (Holded API v2). Cursor-paginated: pass the previous response `nextCursor` as `cursor`. ' +
        'Optionally filter by `start_date`/`end_date` (ISO 8601, e.g. `2025-01-01`) — the v2 endpoint returns 422 if neither date is provided. ' +
        'For the read-only daily-ledger tool with groupByEntry support and Unix-timestamp backward compat see get_daily_ledger.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max items per page' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
          start_date: { type: 'string', description: 'Filter start date (ISO 8601, YYYY-MM-DD)' },
          end_date: { type: 'string', description: 'Filter end date (ISO 8601, YYYY-MM-DD)' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { limit?: number; cursor?: string; start_date?: string; end_date?: string } = {}
      ) => {
        const params: Record<string, string | number> = { ...cursorParams(args) };
        if (args.start_date !== undefined) params.start_date = args.start_date;
        if (args.end_date !== undefined) params.end_date = args.end_date;
        return normalizeV2List(await client.get('/ledger-entries', params));
      },
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
        client.post('/ledger-entries', args.data),
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
        normalizeV2List(await client.get('/accounting-accounts', cursorParams(args))),
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
        client.post('/accounting-accounts', args.data),
    },
  };
}
