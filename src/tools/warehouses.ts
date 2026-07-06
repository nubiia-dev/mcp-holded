import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import {
  warehouseIdSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
  warehouseStockSchema,
  withValidation,
} from '../validation.js';

export function getWarehouseTools(client: HoldedClient) {
  return {
    // List Warehouses
    list_warehouses: {
      description:
        'List all warehouses (Holded API v2). All warehouses are returned in a single call (no cursor pagination). Supports field filtering and summary mode.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          summary: {
            type: 'boolean',
            description: 'Return only total count without items (default: false)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Project only these fields per item (e.g. ["id", "name", "address"]). Reduces response size.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { summary?: boolean; fields?: string[] } = {}) => {
        const result = normalizeV2List(await client.get('/warehouses', undefined));

        if (args.fields?.length) {
          result.items = (result.items as Array<Record<string, unknown>>).map((warehouse) => {
            const picked: Record<string, unknown> = {};
            for (const f of args.fields as string[]) if (f in warehouse) picked[f] = warehouse[f];
            return picked;
          });
        }

        if (args.summary) {
          return { total: result.items.length };
        }

        return result;
      },
    },

    // Create Warehouse
    create_warehouse: {
      description: 'Create a new warehouse (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Warehouse name',
          },
          address: {
            type: 'string',
            description: 'Warehouse address',
          },
          city: {
            type: 'string',
            description: 'City',
          },
          postalCode: {
            type: 'string',
            description: 'Postal code',
          },
          province: {
            type: 'string',
            description: 'Province',
          },
          country: {
            type: 'string',
            description: 'Country',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: withValidation(createWarehouseSchema, async (args) => {
        return client.post('/warehouses', args);
      }),
    },

    // List Products Stock in Warehouse
    list_warehouse_stock: {
      description:
        'List all products stock in a specific warehouse (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. API caps at 100 items per page. Supports field filtering to reduce response size.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          warehouseId: {
            type: 'string',
            description: 'Warehouse ID',
          },
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
              'Project only these fields per item (e.g. ["product_id", "stock"]). Reduces response size.',
          },
        },
        required: ['warehouseId'],
      },
      readOnlyHint: true,
      handler: withValidation(warehouseStockSchema, async (args) => {
        const result = normalizeV2List(
          await client.get(`/warehouses/${args.warehouseId}/stock`, cursorParams(args))
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
      }),
    },

    // Get Warehouse
    get_warehouse: {
      description: 'Get a specific warehouse by ID (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          warehouseId: {
            type: 'string',
            description: 'Warehouse ID',
          },
        },
        required: ['warehouseId'],
      },
      readOnlyHint: true,
      handler: withValidation(warehouseIdSchema, async (args) => {
        return client.get(`/warehouses/${args.warehouseId}`, undefined);
      }),
    },

    // Update Warehouse
    update_warehouse: {
      description:
        'Update an existing warehouse (Holded API v2). ' +
        'BREAKING CHANGE from v1: HTTP verb changed from PUT to PATCH.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          warehouseId: {
            type: 'string',
            description: 'Warehouse ID to update',
          },
          name: {
            type: 'string',
            description: 'Warehouse name',
          },
          address: {
            type: 'string',
            description: 'Warehouse address',
          },
          city: {
            type: 'string',
            description: 'City',
          },
          postalCode: {
            type: 'string',
            description: 'Postal code',
          },
          province: {
            type: 'string',
            description: 'Province',
          },
          country: {
            type: 'string',
            description: 'Country',
          },
        },
        required: ['warehouseId'],
      },
      destructiveHint: true,
      handler: withValidation(updateWarehouseSchema, async (args) => {
        const { warehouseId, ...body } = args;
        return client.patch(`/warehouses/${warehouseId}`, body);
      }),
    },

    // Delete Warehouse
    delete_warehouse: {
      description: 'Delete a warehouse (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          warehouseId: {
            type: 'string',
            description: 'Warehouse ID to delete',
          },
        },
        required: ['warehouseId'],
      },
      destructiveHint: true,
      handler: withValidation(warehouseIdSchema, async (args) => {
        return client.delete(`/warehouses/${args.warehouseId}`);
      }),
    },
  };
}
