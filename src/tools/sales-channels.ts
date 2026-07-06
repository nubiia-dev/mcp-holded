import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';

export function getSalesChannelTools(client: HoldedClient) {
  return {
    // List Sales Channels
    list_sales_channels: {
      description:
        'List all sales channels (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma. Supports field filtering to reduce response size.',
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
              'Project only these fields per item (e.g. ["id", "name"]). Reduces response size.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { limit?: number; cursor?: string; summary?: boolean; fields?: string[] } = {}
      ) => {
        const result = normalizeV2List(await client.get('/sales-channels', cursorParams(args)));

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

    // Create Sales Channel
    create_sales_channel: {
      description: 'Create a new sales channel (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Sales channel name',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: async (args: Record<string, unknown>) => {
        return client.post('/sales-channels', args);
      },
    },

    // Get Sales Channel
    get_sales_channel: {
      description: 'Get a specific sales channel by ID (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          channelId: {
            type: 'string',
            description: 'Sales channel ID',
          },
        },
        required: ['channelId'],
      },
      readOnlyHint: true,
      handler: async (args: { channelId: string }) => {
        return client.get(`/sales-channels/${args.channelId}`, undefined);
      },
    },

    // Update Sales Channel
    update_sales_channel: {
      description: 'Update an existing sales channel (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          channelId: {
            type: 'string',
            description: 'Sales channel ID to update',
          },
          name: {
            type: 'string',
            description: 'Sales channel name',
          },
        },
        required: ['channelId'],
      },
      destructiveHint: true,
      handler: async (args: { channelId: string; [key: string]: unknown }) => {
        const { channelId, ...body } = args;
        return client.put(`/sales-channels/${channelId}`, body);
      },
    },

    // Delete Sales Channel
    delete_sales_channel: {
      description: 'Delete a sales channel (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          channelId: {
            type: 'string',
            description: 'Sales channel ID to delete',
          },
        },
        required: ['channelId'],
      },
      destructiveHint: true,
      handler: async (args: { channelId: string }) => {
        return client.delete(`/sales-channels/${args.channelId}`);
      },
    },
  };
}
