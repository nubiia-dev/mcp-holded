import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import { treasuryIdSchema, createTreasurySchema, withValidation } from '../validation.js';

export function getTreasuryTools(client: HoldedClient) {
  return {
    // List Treasuries Accounts
    list_treasuries: {
      description:
        'List all treasury accounts (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma. WARNING: the `balance` field is a STATIC opening figure, not a live balance derived from transactions — do NOT rely on it for reconciliation or to compute the current cash position. Overlaps with list_bank_accounts/get_bank_account/create_bank_account (official treasury tools); consolidation planned for 2.1.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: {
            type: 'number',
            description: 'Max items per page (API caps at 100)',
          },
          cursor: {
            type: 'string',
            description: 'Cursor from a previous response nextCursor',
          },
          summary: {
            type: 'boolean',
            description: 'Return only count and pagination metadata without items (default: false)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Project only these fields per item (e.g. ["id", "name", "balance"]). Reduces response size.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { limit?: number; cursor?: string; summary?: boolean; fields?: string[] } = {}
      ) => {
        const result = normalizeV2List(await client.get('/treasury/accounts', cursorParams(args)));

        if (args.fields?.length) {
          result.items = (result.items as Array<Record<string, unknown>>).map((item) => {
            const picked: Record<string, unknown> = {};
            for (const f of args.fields as string[]) if (f in item) picked[f] = item[f];
            return picked;
          });
        }

        if (args.summary) {
          const out: Record<string, unknown> = { count: result.items.length };
          if (result.nextCursor) out.nextCursor = result.nextCursor;
          if (result.hasMore !== undefined) out.hasMore = result.hasMore;
          return out;
        }

        return result;
      },
    },

    // Create Treasury Account
    create_treasury: {
      description:
        'Create a new treasury account (Holded API v2). Overlaps with list_bank_accounts/get_bank_account/create_bank_account (official treasury tools); consolidation planned for 2.1.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Treasury account name',
          },
          iban: {
            type: 'string',
            description: 'IBAN number',
          },
          bic: {
            type: 'string',
            description: 'BIC/SWIFT code',
          },
          balance: {
            type: 'number',
            description: 'Initial balance',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: withValidation(createTreasurySchema, async (args) => {
        return client.post('/treasury/accounts', args);
      }),
    },

    // Get Treasury Account
    get_treasury: {
      description:
        'Get a specific treasury account by ID (Holded API v2). WARNING: the `balance` field is a STATIC opening figure set on the account, not a live balance computed from transactions — do NOT use it for reconciliation or as the current cash position. Overlaps with list_bank_accounts/get_bank_account/create_bank_account (official treasury tools); consolidation planned for 2.1.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          treasuryId: {
            type: 'string',
            description: 'Treasury account ID',
          },
        },
        required: ['treasuryId'],
      },
      readOnlyHint: true,
      handler: withValidation(treasuryIdSchema, async (args) => {
        return client.get(`/treasury/accounts/${args.treasuryId}`, undefined);
      }),
    },
  };
}
