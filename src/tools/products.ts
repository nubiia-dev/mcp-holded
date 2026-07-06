import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import {
  productIdSchema,
  createProductSchema,
  updateProductSchema,
  productImageSchema,
  updateProductStockSchema,
  withValidation,
} from '../validation.js';

export function getProductTools(client: HoldedClient) {
  return {
    // List Products
    list_products: {
      description:
        'List products (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. API caps at 100 items per page. Response fields are snake_case; amounts are strings with decimal comma.',
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
              'Project only these fields per item (e.g. ["id", "name", "sku"]). Reduces response size.',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: {
          limit?: number;
          cursor?: string;
          summary?: boolean;
          fields?: string[];
        } = {}
      ) => {
        const result = normalizeV2List(await client.get('/products', cursorParams(args)));

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

    // Create Product
    create_product: {
      description: 'Create a new product (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Product name',
          },
          sku: {
            type: 'string',
            description: 'Product SKU',
          },
          barcode: {
            type: 'string',
            description: 'Product barcode',
          },
          price: {
            type: 'number',
            description: 'Product price',
          },
          costPrice: {
            type: 'number',
            description: 'Cost price',
          },
          tax: {
            type: 'number',
            description: 'Tax percentage',
          },
          description: {
            type: 'string',
            description: 'Product description',
          },
          stock: {
            type: 'number',
            description: 'Initial stock quantity',
          },
          kind: {
            type: 'string',
            enum: ['product', 'service'],
            description: 'Product kind',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: withValidation(createProductSchema, async (args) => {
        return client.post('/products', args);
      }),
    },

    // Get Product
    get_product: {
      description: 'Get a specific product by ID (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID',
          },
        },
        required: ['productId'],
      },
      readOnlyHint: true,
      handler: withValidation(productIdSchema, async (args) => {
        return client.get(`/products/${args.productId}`, undefined);
      }),
    },

    // Update Product
    update_product: {
      description: 'Update an existing product (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID to update',
          },
          name: {
            type: 'string',
            description: 'Product name',
          },
          sku: {
            type: 'string',
            description: 'Product SKU',
          },
          barcode: {
            type: 'string',
            description: 'Product barcode',
          },
          price: {
            type: 'number',
            description: 'Product price',
          },
          costPrice: {
            type: 'number',
            description: 'Cost price',
          },
          tax: {
            type: 'number',
            description: 'Tax percentage',
          },
          description: {
            type: 'string',
            description: 'Product description',
          },
        },
        required: ['productId'],
      },
      destructiveHint: true,
      handler: withValidation(updateProductSchema, async (args) => {
        const { productId, ...body } = args;
        return client.put(`/products/${productId}`, body);
      }),
    },

    // Delete Product
    delete_product: {
      description: 'Delete a product (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID to delete',
          },
        },
        required: ['productId'],
      },
      destructiveHint: true,
      handler: withValidation(productIdSchema, async (args) => {
        return client.delete(`/products/${args.productId}`);
      }),
    },

    // Get Product Main Image
    get_product_main_image: {
      description: 'Get the main image of a product (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID',
          },
        },
        required: ['productId'],
      },
      readOnlyHint: true,
      handler: withValidation(productIdSchema, async (args) => {
        return client.get(`/products/${args.productId}/image`, undefined);
      }),
    },

    // List Product Images
    list_product_images: {
      description: 'List all images of a product (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID',
          },
        },
        required: ['productId'],
      },
      readOnlyHint: true,
      handler: withValidation(productIdSchema, async (args) => {
        return client.get(`/products/${args.productId}/images`, undefined);
      }),
    },

    // Get Product Secondary Image
    get_product_secondary_image: {
      description: 'Get a secondary image of a product (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID',
          },
          imageId: {
            type: 'string',
            description: 'Image ID',
          },
        },
        required: ['productId', 'imageId'],
      },
      readOnlyHint: true,
      handler: withValidation(productImageSchema, async (args) => {
        return client.get(`/products/${args.productId}/images/${args.imageId}`, undefined);
      }),
    },

    // Update Product Stock
    update_product_stock: {
      description:
        'Update stock quantity for a product (Holded API v2). ' +
        'BREAKING CHANGE from v1: `warehouse_id` is now required; `stock_variation` replaces `units`; optional `variant_id` and `description` added.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID',
          },
          warehouse_id: {
            type: 'string',
            description: 'Warehouse ID (required in v2 — v2 rejects stock updates without it)',
          },
          stock_variation: {
            type: 'number',
            description:
              'Stock delta (positive to add, negative to subtract). Replaces v1 `units`.',
          },
          variant_id: {
            type: 'string',
            description: 'Variant ID to target a specific product variant (optional)',
          },
          description: {
            type: 'string',
            description: 'Audit note describing the stock adjustment (optional)',
          },
        },
        required: ['productId', 'warehouse_id', 'stock_variation'],
      },
      destructiveHint: true,
      handler: withValidation(updateProductStockSchema, async (args) => {
        const body: Record<string, unknown> = {
          stock_variation: args.stock_variation,
          warehouse_id: args.warehouse_id,
        };
        if (args.variant_id) body.variant_id = args.variant_id;
        if (args.description) body.description = args.description;
        return client.put(`/products/${args.productId}/stock`, body);
      }),
    },
  };
}
