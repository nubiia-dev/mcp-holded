import { HoldedClient } from '../holded-client.js';
import { normalizeV2List } from '../utils/v2-pagination.js';

export function getTaxTools(client: HoldedClient) {
  return {
    // Get Taxes
    get_taxes: {
      description:
        'Get all available taxes (Holded API v2). The v2 /taxes endpoint returns the complete tax list in one response (no cursor, no pagination). Supports `fields` to select specific fields and `summary` to return only the item count. Amounts are strings with decimal comma. Each tax has: `key` (the stable identifier, e.g. "s_iva_21"/"p_iva_21" — this is the value used in a document line\'s `taxes[]`), `id` (mirrors `key`), `name`, `amount` (the percentage as a string, e.g. "21"), `scope` ("sales" or "purchase"), `group` (e.g. "iva"), and `type`.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          summary: {
            type: 'boolean',
            description: 'Return only the item count without the full list (default: false)',
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
      handler: async (args: { summary?: boolean; fields?: string[] } = {}) => {
        const v2Response = await client.get('/taxes', undefined);
        const normalized = normalizeV2List(v2Response);
        const taxes = normalized.items as Array<Record<string, unknown>>;

        // Field filtering: if fields specified, return only those fields.
        // Otherwise, return a default set using the API's real field names
        // (the rate lives in `amount`, the identifier in `key` — not
        // `percentage`/`id`, which is why the old defaults came back blank).
        const defaultFields = ['id', 'key', 'name', 'amount', 'scope', 'group', 'type'];
        const fieldsToInclude = args.fields && args.fields.length > 0 ? args.fields : defaultFields;

        const items = taxes.map((tax) => {
          const result: Record<string, unknown> = {};
          for (const field of fieldsToInclude) {
            if (field in tax) {
              result[field] = tax[field];
            }
          }
          return result;
        });

        // Summary mode: return only count
        if (args.summary) {
          return {
            count: items.length,
          };
        }

        return { items };
      },
    },
  };
}
