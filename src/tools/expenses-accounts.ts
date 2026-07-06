import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

export function getExpensesAccountTools(client: HoldedClient) {
  return {
    // List Expenses Accounts
    list_expenses_accounts: {
      description:
        'List expenses accounts (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma. Each account has `id` (Holded internal id), `name`, and `accountNum` (the PGC account number, e.g. 62900000). NOTE: this endpoint only returns expense/purchase accounts (PGC group 6). Income accounts (group 7, e.g. 700/705/759) are NOT listed here — fetch the full chart via get_chart_of_accounts, or read a known account by id via get_expenses_account.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: {
            type: 'number',
            description: 'Max items per page (server-paginated; use limit to control page size)',
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
              'Project only these fields per item (e.g. ["id", "name", "accountNum"]). Reduces response size. NOTE: the PGC number field is `accountNum` (not `code`).',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { limit?: number; cursor?: string; summary?: boolean; fields?: string[] } = {}
      ) => {
        const result = normalizeV2List(await client.get('/expenses-accounts', cursorParams(args)));

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

    // Create Expenses Account
    create_expenses_account: {
      description: 'Create a new expenses account (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Expenses account name',
          },
          code: {
            type: 'string',
            description:
              'PGC account number (e.g. "62900000"). This is the value surfaced as `accountNum` by list_expenses_accounts — Holded accepts it under the `code` key on create/update.',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: async (args: Record<string, unknown>) => {
        return client.post('/expenses-accounts', args);
      },
    },

    // Get Expenses Account
    get_expenses_account: {
      description:
        'Get a single account by its Holded id (Holded API v2). Despite the "expenses" name, this endpoint serves ANY account (including income/group-7 accounts that list_expenses_accounts omits) when you already know its id.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: {
            type: 'string',
            description: 'Account Holded id (the `id` field, not the PGC accountNum)',
          },
        },
        required: ['accountId'],
      },
      readOnlyHint: true,
      handler: async (args: { accountId: string }) => {
        return client.get(`/expenses-accounts/${args.accountId}`, undefined);
      },
    },

    // Update Expenses Account
    update_expenses_account: {
      description: 'Update an existing expenses account (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: {
            type: 'string',
            description: 'Expenses account ID to update',
          },
          name: {
            type: 'string',
            description: 'Expenses account name',
          },
          code: {
            type: 'string',
            description:
              'PGC account number (e.g. "62900000"). This is the value surfaced as `accountNum` by list_expenses_accounts — Holded accepts it under the `code` key on create/update.',
          },
        },
        required: ['accountId'],
      },
      destructiveHint: true,
      handler: async (args: { accountId: string; [key: string]: unknown }) => {
        const { accountId, ...body } = args;
        return client.put(`/expenses-accounts/${accountId}`, body);
      },
    },

    // Delete Expenses Account
    delete_expenses_account: {
      description: 'Delete an expenses account (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountId: {
            type: 'string',
            description: 'Expenses account ID to delete',
          },
        },
        required: ['accountId'],
      },
      destructiveHint: true,
      handler: async (args: { accountId: string }) => {
        return client.delete(`/expenses-accounts/${args.accountId}`);
      },
    },
  };
}
