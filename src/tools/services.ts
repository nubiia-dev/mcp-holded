import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import {
  serviceIdSchema,
  createServiceSchema,
  updateServiceSchema,
  withValidation,
} from '../validation.js';

export function getServiceTools(client: HoldedClient) {
  return {
    // List Services
    list_services: {
      description:
        'List all services (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma. Supports field filtering to reduce response size.',
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
              'Project only these fields per item (e.g. ["id", "name", "price", "tax"]). Reduces response size.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { limit?: number; cursor?: string; summary?: boolean; fields?: string[] } = {}
      ) => {
        const result = normalizeV2List(await client.get('/services', cursorParams(args)));

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

    // Create Service
    create_service: {
      description: 'Create a new service (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Service name',
          },
          sku: {
            type: 'string',
            description: 'Service SKU',
          },
          price: {
            type: 'number',
            description: 'Service price',
          },
          tax: {
            type: 'number',
            description: 'Tax percentage',
          },
          description: {
            type: 'string',
            description: 'Service description',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: withValidation(createServiceSchema, async (args) => {
        return client.post('/services', args);
      }),
    },

    // Get Service
    get_service: {
      description: 'Get a specific service by ID (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceId: {
            type: 'string',
            description: 'Service ID',
          },
        },
        required: ['serviceId'],
      },
      readOnlyHint: true,
      handler: withValidation(serviceIdSchema, async (args) => {
        return client.get(`/services/${args.serviceId}`, undefined);
      }),
    },

    // Update Service
    update_service: {
      description: 'Update an existing service (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceId: {
            type: 'string',
            description: 'Service ID to update',
          },
          name: {
            type: 'string',
            description: 'Service name',
          },
          sku: {
            type: 'string',
            description: 'Service SKU',
          },
          price: {
            type: 'number',
            description: 'Service price',
          },
          tax: {
            type: 'number',
            description: 'Tax percentage',
          },
          description: {
            type: 'string',
            description: 'Service description',
          },
        },
        required: ['serviceId'],
      },
      destructiveHint: true,
      handler: withValidation(updateServiceSchema, async (args) => {
        const { serviceId, ...body } = args;
        return client.put(`/services/${serviceId}`, body);
      }),
    },

    // Delete Service
    delete_service: {
      description: 'Delete a service (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceId: {
            type: 'string',
            description: 'Service ID to delete',
          },
        },
        required: ['serviceId'],
      },
      destructiveHint: true,
      handler: withValidation(serviceIdSchema, async (args) => {
        return client.delete(`/services/${args.serviceId}`);
      }),
    },
  };
}
