import { HoldedClient } from '../holded-client.js';
import { treasuryIdSchema, createTreasurySchema, withValidation } from '../validation.js';

export function getTreasuryTools(client: HoldedClient) {
  return {
    // List Treasuries Accounts
    list_treasuries: {
      description:
        'List all treasury accounts with pagination support. Supports field filtering to reduce response size. WARNING: the `balance` field is a STATIC opening figure, not a live balance derived from transactions — do NOT rely on it for reconciliation or to compute the current cash position.',
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
              'Select specific fields to return (e.g., ["id", "name", "balance"]). Reduces response size by 70-90%. If not provided, returns default fields: id, name, balance',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { page?: number; pageSize?: number; summary?: boolean; fields?: string[] } = {}
      ) => {
        const treasuries = (await client.get('/treasury')) as Array<Record<string, unknown>>;

        // Field filtering: if fields specified, return only those fields
        // Otherwise, return default minimal set
        const defaultFields = ['id', 'name', 'balance'];
        const fieldsToInclude = args.fields && args.fields.length > 0 ? args.fields : defaultFields;

        const filtered = treasuries.map((treasury) => {
          const result: Record<string, unknown> = {};
          for (const field of fieldsToInclude) {
            if (field in treasury) {
              result[field] = treasury[field];
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

    // Create Treasury Account
    create_treasury: {
      description: 'Create a new treasury account',
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
        return client.post('/treasury', args);
      }),
    },

    // Get Treasury Account
    get_treasury: {
      description:
        'Get a specific treasury account by ID. WARNING: the `balance` field is a STATIC opening figure set on the account, not a live balance computed from transactions — do NOT use it for reconciliation or as the current cash position.',
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
        return client.get(`/treasury/${args.treasuryId}`);
      }),
    },
  };
}
