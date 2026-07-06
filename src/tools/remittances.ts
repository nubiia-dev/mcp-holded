import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

export function getRemittanceTools(client: HoldedClient) {
  return {
    // List Remittances
    list_remittances: {
      description:
        'List all remittances (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma. NOTE: namespace relocated from /remittances to /treasury/remittances in v2.',
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
              'Project only these fields per item (e.g. ["id", "name", "date"]). Reduces response size.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { limit?: number; cursor?: string; summary?: boolean; fields?: string[] } = {}
      ) => {
        const result = normalizeV2List(
          await client.get('/treasury/remittances', cursorParams(args))
        );

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

    // Get Remittance
    get_remittance: {
      description:
        'Get a specific remittance by ID (Holded API v2). NOTE: route relocated to /treasury/remittances/{id} in v2.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          remittanceId: {
            type: 'string',
            description: 'Remittance ID',
          },
        },
        required: ['remittanceId'],
      },
      readOnlyHint: true,
      handler: async (args: { remittanceId: string }) => {
        return client.get(`/treasury/remittances/${args.remittanceId}`, undefined);
      },
    },
  };
}
