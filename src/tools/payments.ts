import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
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
        "List all payments (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma. NOTE: this endpoint is filtered to the ACTIVE fiscal year, so payments made in a prior year do NOT appear here even if they are linked to documents. For cross-year payment audits, read a document's payments via get_document_payments (the document `paymentsDetail`). Use start_date/end_date (YYYY-MM-DD) to filter by date — live-verified against v2.",
      inputSchema: {
        type: 'object' as const,
        properties: {
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
              'Select specific fields to return (e.g., ["id", "name", "days", "discount"]). Reduces response size. If not provided, returns all fields from the API.',
          },
          start_date: {
            type: 'string',
            description:
              'Filter payments on or after this ISO date (YYYY-MM-DD). Forwarded directly to the v2 API.',
          },
          end_date: {
            type: 'string',
            description:
              'Filter payments on or before this ISO date (YYYY-MM-DD). Forwarded directly to the v2 API.',
          },
          starttmp: {
            type: 'number',
            description:
              'Legacy: Unix timestamp (seconds) for start date. Converted to ISO YYYY-MM-DD. Ignored when start_date is also provided.',
          },
          endtmp: {
            type: 'number',
            description:
              'Legacy: Unix timestamp (seconds) for end date. Converted to ISO YYYY-MM-DD. Ignored when end_date is also provided.',
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
          start_date?: string;
          end_date?: string;
          starttmp?: number;
          endtmp?: number;
        } = {}
      ) => {
        const params = cursorParams(args);
        // Resolve start_date: ISO wins over legacy starttmp
        const startDate =
          args.start_date ??
          (args.starttmp !== undefined
            ? new Date(args.starttmp * 1000).toISOString().slice(0, 10)
            : undefined);
        if (startDate) params.start_date = startDate;
        // Resolve end_date: ISO wins over legacy endtmp
        const endDate =
          args.end_date ??
          (args.endtmp !== undefined
            ? new Date(args.endtmp * 1000).toISOString().slice(0, 10)
            : undefined);
        if (endDate) params.end_date = endDate;

        const result = normalizeV2List(await client.get('/payments', params));

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

    // Create Payment
    create_payment: {
      description: 'Create a new payment (Holded API v2)',
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
      description: 'Get a specific payment by ID (Holded API v2)',
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
        return client.get(`/payments/${args.paymentId}`, undefined);
      }),
    },

    // Update Payment
    update_payment: {
      description:
        "Update an existing payment (Holded API v2). IMPORTANT: Holded's PUT /payments/{id} REPLACES the record rather than merging, so any field omitted from the body is blanked. To prevent that, this tool first re-reads the current payment and merges your changes over it, preserving fields you did not pass (contactId, bankId, date, ...).",
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
          const current = await client.get(`/payments/${paymentId}`, undefined);
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
      description: 'Delete a payment (Holded API v2)',
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
