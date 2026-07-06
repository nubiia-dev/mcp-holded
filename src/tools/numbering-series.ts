import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import {
  numberingSerieIdSchema,
  createNumberingSerieSchema,
  updateNumberingSerieSchema,
  withValidation,
} from '../validation.js';

export function getNumberingSeriesTools(client: HoldedClient) {
  return {
    // Get Numbering Series by Type
    get_numbering_series: {
      description:
        'List numbering series for a specific document type (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          docType: {
            type: 'string',
            enum: [
              'invoice',
              'salesreceipt',
              'creditnote',
              'receiptnote',
              'estimate',
              'salesorder',
              'waybill',
              'proform',
              'purchase',
              'purchaserefund',
              'purchaseorder',
            ],
            description: 'Document type',
          },
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
              'Project only these fields per item (e.g. ["id", "name", "prefix", "nextNumber"]). Reduces response size.',
          },
        },
        required: ['docType'],
      },
      readOnlyHint: true,
      handler: async (args: {
        docType: string;
        limit?: number;
        cursor?: string;
        summary?: boolean;
        fields?: string[];
      }) => {
        const result = normalizeV2List(
          await client.get(`/numbering-series/${args.docType}`, cursorParams(args))
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

    // Create Numbering Serie
    create_numbering_serie: {
      description: 'Create a new numbering serie (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          docType: {
            type: 'string',
            enum: [
              'invoice',
              'salesreceipt',
              'creditnote',
              'receiptnote',
              'estimate',
              'salesorder',
              'waybill',
              'proform',
              'purchase',
              'purchaserefund',
              'purchaseorder',
            ],
            description: 'Document type',
          },
          name: {
            type: 'string',
            description: 'Serie name',
          },
          prefix: {
            type: 'string',
            description: 'Serie prefix',
          },
          nextNumber: {
            type: 'number',
            description: 'Next number in the serie',
          },
        },
        required: ['docType', 'name'],
      },
      destructiveHint: true,
      handler: withValidation(createNumberingSerieSchema, async (args) => {
        const { docType, ...body } = args;
        return client.post(`/numbering-series/${docType}`, body);
      }),
    },

    // Update Numbering Serie
    update_numbering_serie: {
      description: 'Update an existing numbering serie (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          docType: {
            type: 'string',
            enum: [
              'invoice',
              'salesreceipt',
              'creditnote',
              'receiptnote',
              'estimate',
              'salesorder',
              'waybill',
              'proform',
              'purchase',
              'purchaserefund',
              'purchaseorder',
            ],
            description: 'Document type',
          },
          serieId: {
            type: 'string',
            description: 'Serie ID to update',
          },
          name: {
            type: 'string',
            description: 'Serie name',
          },
          prefix: {
            type: 'string',
            description: 'Serie prefix',
          },
          nextNumber: {
            type: 'number',
            description: 'Next number in the serie',
          },
        },
        required: ['docType', 'serieId'],
      },
      destructiveHint: true,
      handler: withValidation(updateNumberingSerieSchema, async (args) => {
        const { docType, serieId, ...body } = args;
        return client.put(`/numbering-series/${docType}/${serieId}`, body);
      }),
    },

    // Delete Numbering Serie
    delete_numbering_serie: {
      description: 'Delete a numbering serie (Holded API v2)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          docType: {
            type: 'string',
            enum: [
              'invoice',
              'salesreceipt',
              'creditnote',
              'receiptnote',
              'estimate',
              'salesorder',
              'waybill',
              'proform',
              'purchase',
              'purchaserefund',
              'purchaseorder',
            ],
            description: 'Document type',
          },
          serieId: {
            type: 'string',
            description: 'Serie ID to delete',
          },
        },
        required: ['docType', 'serieId'],
      },
      destructiveHint: true,
      handler: withValidation(numberingSerieIdSchema, async (args) => {
        return client.delete(`/numbering-series/${args.docType}/${args.serieId}`);
      }),
    },
  };
}
