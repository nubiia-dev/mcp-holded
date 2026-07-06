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
