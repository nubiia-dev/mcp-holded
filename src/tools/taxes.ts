import { HoldedClient } from '../holded-client.js';

export function getTaxTools(client: HoldedClient) {
  return {
    // Get Taxes
    get_taxes: {
      description:
        'Get all available taxes with pagination support. Supports field filtering to reduce response size. Each tax has: `key` (the stable identifier, e.g. "s_iva_21"/"p_iva_21" — this is the value used in a document line\'s `taxes[]`), `id` (mirrors `key`), `name`, `amount` (the percentage as a string, e.g. "21"), `scope` ("sales" or "purchase"), `group` (e.g. "iva"), and `type`.',
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
              'Select specific fields to return (e.g., ["key", "name", "amount", "scope"]). Reduces response size. If not provided, returns default fields: id, key, name, amount, scope, group, type. NOTE: the tax rate field is `amount` (not `percentage`) and the identifier is `key`.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { page?: number; pageSize?: number; summary?: boolean; fields?: string[] } = {}
      ) => {
        const taxes = (await client.get('/taxes')) as Array<Record<string, unknown>>;

        // Field filtering: if fields specified, return only those fields.
        // Otherwise, return a default set using the API's real field names
        // (the rate lives in `amount`, the identifier in `key` — not
        // `percentage`/`id`, which is why the old defaults came back blank).
        const defaultFields = ['id', 'key', 'name', 'amount', 'scope', 'group', 'type'];
        const fieldsToInclude = args.fields && args.fields.length > 0 ? args.fields : defaultFields;

        const filtered = taxes.map((tax) => {
          const result: Record<string, unknown> = {};
          for (const field of fieldsToInclude) {
            if (field in tax) {
              result[field] = tax[field];
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
  };
}
