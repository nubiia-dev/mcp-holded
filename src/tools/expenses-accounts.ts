import { HoldedClient } from '../holded-client.js';

export function getExpensesAccountTools(client: HoldedClient) {
  return {
    // List Expenses Accounts
    list_expenses_accounts: {
      description:
        'List expenses accounts with pagination support. Supports field filtering to reduce response size. Each account has `id` (Holded internal id), `name`, and `accountNum` (the PGC account number, e.g. 62900000). NOTE: this endpoint only returns expense/purchase accounts (PGC group 6). Income accounts (group 7, e.g. 700/705/759) are NOT listed here — fetch the full chart via get_chart_of_accounts, or read a known account by id via get_expenses_account.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          page: {
            type: 'number',
            description: 'Page number (starting from 1, default: 1)',
          },
          pageSize: {
            type: 'number',
            description: 'Number of items per page (default: 50, max: 500)',
          },
          summary: {
            type: 'boolean',
            description: 'Return only total count and page count without items (default: false)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Select specific fields to return (e.g., ["id", "name", "accountNum"]). Reduces response size. If not provided, returns default fields: id, name, accountNum. NOTE: the PGC number field is `accountNum` (not `code`).',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { page?: number; pageSize?: number; summary?: boolean; fields?: string[] } = {}
      ) => {
        const accounts = (await client.get('/expensesaccounts')) as Array<Record<string, unknown>>;

        // Field filtering: if fields specified, return only those fields.
        // Otherwise, return a default set using the API's real field names
        // (the PGC number lives in `accountNum`, not `code`).
        const defaultFields = ['id', 'name', 'accountNum'];
        const fieldsToInclude = args.fields && args.fields.length > 0 ? args.fields : defaultFields;

        const filtered = accounts.map((account) => {
          const result: Record<string, unknown> = {};
          for (const field of fieldsToInclude) {
            if (field in account) {
              result[field] = account[field];
            }
          }
          return result;
        });

        // Pagination
        const page = Math.max(args.page ?? 1, 1);
        const pageSize = Math.min(args.pageSize ?? 50, 500);
        const total = filtered.length;
        const totalPages = Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const items = filtered.slice(startIndex, endIndex);

        // Summary mode: return only metadata
        if (args.summary) {
          return {
            total,
            totalPages,
          };
        }

        return {
          items,
          page,
          pageSize,
          total,
          totalPages,
        };
      },
    },

    // Create Expenses Account
    create_expenses_account: {
      description: 'Create a new expenses account',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Expenses account name',
          },
          code: {
            type: 'string',
            description: 'Account code',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: async (args: Record<string, unknown>) => {
        return client.post('/expensesaccounts', args);
      },
    },

    // Get Expenses Account
    get_expenses_account: {
      description:
        'Get a single account by its Holded id. Despite the "expenses" name, this endpoint serves ANY account (including income/group-7 accounts that list_expenses_accounts omits) when you already know its id.',
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
        return client.get(`/expensesaccounts/${args.accountId}`);
      },
    },

    // Update Expenses Account
    update_expenses_account: {
      description: 'Update an existing expenses account',
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
            description: 'Account code',
          },
        },
        required: ['accountId'],
      },
      destructiveHint: true,
      handler: async (args: { accountId: string; [key: string]: unknown }) => {
        const { accountId, ...body } = args;
        return client.put(`/expensesaccounts/${accountId}`, body);
      },
    },

    // Delete Expenses Account
    delete_expenses_account: {
      description: 'Delete an expenses account',
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
        return client.delete(`/expensesaccounts/${args.accountId}`);
      },
    },
  };
}
