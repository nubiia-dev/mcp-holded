import { HoldedClient } from '../holded-client.js';
import {
  paymentIdSchema,
  createPaymentSchema,
  updatePaymentSchema,
  withValidation,
} from '../validation.js';

export function getPaymentTools(client: HoldedClient) {
  return {
    // List Payments
    list_payments: {
      description:
        "List all payments with optional filters for date range. Supports field filtering to reduce response size. NOTE: this endpoint is filtered to the ACTIVE fiscal year, so payments made in a prior year do NOT appear here even if they are linked to documents. For cross-year payment audits, read a document's payments via get_document_payments (the document `paymentsDetail`).",
      inputSchema: {
        type: 'object' as const,
        properties: {
          page: {
            type: 'number',
            description: 'Page number for pagination (optional)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return (default: 50, max: 500)',
          },
          summary: {
            type: 'boolean',
            description: 'Return only count and pagination metadata without items (default: false)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Select specific fields to return (e.g., ["id", "name", "days", "discount"]). Reduces response size by 70-90%. If not provided, returns default fields: id, name, days, discount',
          },
          starttmp: {
            type: 'string',
            description: 'Starting timestamp (Unix timestamp) for filtering payments by date',
          },
          endtmp: {
            type: 'string',
            description: 'Ending timestamp (Unix timestamp) for filtering payments by date',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: {
          page?: number;
          limit?: number;
          summary?: boolean;
          fields?: string[];
          starttmp?: string;
          endtmp?: string;
        } = {}
      ) => {
        const queryParams: Record<string, string | number> = {};
        if (args.page) queryParams.page = args.page;
        if (args.limit) queryParams.limit = Math.min(args.limit, 500);
        if (args.starttmp) {
          queryParams.starttmp = args.starttmp;
          // If starttmp is provided but endtmp is not, default to current timestamp
          if (!args.endtmp) {
            queryParams.endtmp = Math.floor(Date.now() / 1000).toString();
          }
        }
        if (args.endtmp) queryParams.endtmp = args.endtmp;
        const payments = (await client.get('/payments', queryParams)) as Array<
          Record<string, unknown>
        >;

        // Field filtering: if fields specified, return only those fields
        // Otherwise, return default minimal set
        const defaultFields = ['id', 'name', 'days', 'discount'];
        const fieldsToInclude = args.fields && args.fields.length > 0 ? args.fields : defaultFields;

        const filtered = payments.map((payment) => {
          const result: Record<string, unknown> = {};
          for (const field of fieldsToInclude) {
            if (field in payment) {
              result[field] = payment[field];
            }
          }
          return result;
        });

        const limit = Math.min(args.limit ?? 50, 500);
        const items = filtered.slice(0, limit);

        // Summary mode: return only count and metadata
        if (args.summary) {
          return {
            count: items.length,
            hasMore: items.length === limit && filtered.length > limit,
          };
        }

        return {
          items,
          page: args.page,
          pageSize: items.length,
          hasMore: items.length === limit && filtered.length > limit,
        };
      },
    },

    // Create Payment
    create_payment: {
      description: 'Create a new payment',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Payment method name',
          },
          days: {
            type: 'number',
            description: 'Days until due',
          },
        },
        required: ['name'],
      },
      destructiveHint: true,
      handler: withValidation(createPaymentSchema, async (args) => {
        return client.post('/payments', args);
      }),
    },

    // Get Payment
    get_payment: {
      description: 'Get a specific payment by ID',
      inputSchema: {
        type: 'object' as const,
        properties: {
          paymentId: {
            type: 'string',
            description: 'Payment ID',
          },
        },
        required: ['paymentId'],
      },
      readOnlyHint: true,
      handler: withValidation(paymentIdSchema, async (args) => {
        return client.get(`/payments/${args.paymentId}`);
      }),
    },

    // Update Payment
    update_payment: {
      description:
        "Update an existing payment. IMPORTANT: Holded's PUT /payments/{id} REPLACES the record rather than merging, so any field omitted from the body is blanked. To prevent that, this tool first re-reads the current payment and merges your changes over it, preserving fields you did not pass (contactId, bankId, date, ...).",
      inputSchema: {
        type: 'object' as const,
        properties: {
          paymentId: {
            type: 'string',
            description: 'Payment ID to update',
          },
          name: {
            type: 'string',
            description: 'Payment method name',
          },
          days: {
            type: 'number',
            description: 'Days until due',
          },
          bankId: {
            type: 'string',
            description: 'Bank account id to link the payment to',
          },
          contactId: {
            type: 'string',
            description: 'Contact id associated with the payment',
          },
          date: {
            type: 'number',
            description: 'Payment date as a Unix timestamp (seconds)',
          },
          amount: {
            type: 'number',
            description: 'Payment amount',
          },
        },
        required: ['paymentId'],
      },
      destructiveHint: true,
      handler: withValidation(updatePaymentSchema, async (args) => {
        const { paymentId, ...updates } = args;
        // #9 — PUT /payments/{id} REPLACES the resource. Merge the requested
        // changes over the current payment so unspecified fields aren't blanked.
        let base: Record<string, unknown> = {};
        try {
          const current = await client.get(`/payments/${paymentId}`);
          if (current && typeof current === 'object' && !Array.isArray(current)) {
            base = { ...(current as Record<string, unknown>) };
            delete base.id;
          }
        } catch {
          // If the current payment can't be fetched, fall back to a plain update.
        }
        return client.put(`/payments/${paymentId}`, { ...base, ...updates });
      }),
    },

    // Delete Payment
    delete_payment: {
      description: 'Delete a payment',
      inputSchema: {
        type: 'object' as const,
        properties: {
          paymentId: {
            type: 'string',
            description: 'Payment ID to delete',
          },
        },
        required: ['paymentId'],
      },
      destructiveHint: true,
      handler: withValidation(paymentIdSchema, async (args) => {
        return client.delete(`/payments/${args.paymentId}`);
      }),
    },
  };
}
