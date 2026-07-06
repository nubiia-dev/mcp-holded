import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import {
  documentIdSchema,
  createDocumentSchema,
  updateDocumentSchema,
  updateDocumentPipelineSchema,
  attachFileToDocumentSchema,
  shipItemsByLineSchema,
  payDocumentSchema,
  sendDocumentSchema,
  updateDocumentTrackingSchema,
  PURCHASE_DOC_TYPES,
  withValidation,
} from '../validation.js';

/**
 * v1 docType → v2 resource base path.
 * null = create-only special case (purchaserefund: POST /purchases/refund only).
 */
export const DOC_RESOURCES: Record<string, string | null> = {
  invoice: '/invoices',
  salesreceipt: '/sales-receipts',
  creditnote: '/credit-notes',
  // Live probe (Task 12) confirmed GET /receipt-notes → 200. receiptnote maps to
  // /receipt-notes (rectificativas de venta, Sales section). Purchase goods receipts
  // (albaranes de compra) live under purchase-orders receiving: use docType
  // 'purchaseorder' + the /receive sub-action, or query /purchase-shipments directly.
  receiptnote: '/receipt-notes',
  estimate: '/estimates',
  proform: '/proformas',
  salesorder: '/sales-orders',
  waybill: '/waybills',
  purchase: '/purchases',
  purchaseorder: '/purchase-orders',
  purchaserefund: null, // v2 only supports creation via POST /purchases/refund
};

/**
 * Return the v2 base path for a docType, or throw a clear error.
 * - Unknown docType → "Unknown docType '...'"
 * - null (purchaserefund) → "Only creation is supported..." with the exact
 *   v2 route listed so callers know what to use instead.
 */
export function docBase(docType: string): string {
  const base = DOC_RESOURCES[docType];
  if (base === undefined) {
    throw new Error(`Unknown docType '${docType}'`);
  }
  if (base === null) {
    throw new Error(
      `Only creation is supported for '${docType}' by the Holded API v2 (POST /purchases/refund). ` +
        'List/get/update/delete purchase refunds are not available in v2.'
    );
  }
  return base;
}

// Document types supported by Holded
export type DocumentType =
  | 'invoice'
  | 'salesreceipt'
  | 'creditnote'
  | 'receiptnote'
  | 'estimate'
  | 'salesorder'
  | 'waybill'
  | 'proform'
  | 'purchase'
  | 'purchaserefund'
  | 'purchaseorder';

/**
 * Map a tool line-item (camelCase tool args) to a v2 API line item (snake_case).
 * Only the known fields listed below are forwarded; unknown/extra camelCase fields
 * are silently omitted to avoid leaking stale v1 names into the v2 body.
 *
 * Mapping table:
 *   name → name | units → units | subtotal → price (unit price) | desc → description
 *   sku → sku | taxes → taxes | tax → tax | discount → discount | serviceId → service_id
 */
export function toV2DocumentItem(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (item.name !== undefined) out.name = item.name;
  if (item.units !== undefined) out.units = item.units;
  if (item.subtotal !== undefined) out.price = item.subtotal; // unit price
  if (item.desc !== undefined) out.description = item.desc;
  if (item.sku !== undefined) out.sku = item.sku;
  if (item.taxes !== undefined) out.taxes = item.taxes;
  if (item.tax !== undefined) out.tax = item.tax;
  if (item.discount !== undefined) out.discount = item.discount;
  if (item.serviceId !== undefined) out.service_id = item.serviceId;
  return out;
}

/**
 * Map the tool's camelCase write args to the Holded API v2 snake_case request body.
 *
 * Root field mapping (tool arg → v2 body field):
 *   contactId      → contact_id
 *   date           → date as ISO string YYYY-MM-DD (converted from Unix seconds)
 *   invoiceNum     → number (persisted as document_number)
 *   approveDoc     → draft (INVERTED: true → false, false → true; only emitted when present)
 *   notes          → notes (as-is)
 *   currency       → currency (as-is)
 *   salesChannelId → sales_channel_id (best-effort snake_case; unverified live)
 *   expAccountId   → NOT in root body; cascaded to every line item as `account` ObjectId
 *   retention      → NOT in root body; cascaded to every line item as `retention` (best-effort)
 *   items          → each item mapped via toV2DocumentItem
 *
 * Unknown/extra camelCase fields are omitted — they are NOT silently passed through.
 * `approveDoc` is only emitted as `draft` when it is explicitly present in `args`
 * (so update_document, which has no approveDoc in its schema, never adds `draft`).
 */
export function toV2DocumentBody(args: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (args.contactId !== undefined) body.contact_id = args.contactId;

  if (args.date !== undefined) {
    // Convert Unix seconds to YYYY-MM-DD (UTC)
    body.date = new Date((args.date as number) * 1000).toISOString().slice(0, 10);
  }

  if (args.invoiceNum !== undefined) body.number = args.invoiceNum;

  // approveDoc → draft (inverted). Only include `draft` when approveDoc is explicitly provided.
  // create_document always passes a defaulted value; update_document never passes it.
  if (args.approveDoc !== undefined) {
    body.draft = !(args.approveDoc as boolean);
  }

  if (args.notes !== undefined) body.notes = args.notes;
  if (args.currency !== undefined) body.currency = args.currency;

  // salesChannelId → sales_channel_id (best-effort; unverified live — see v2 mapping spec)
  if (args.salesChannelId !== undefined) body.sales_channel_id = args.salesChannelId;

  // Map line items if provided
  if (args.items !== undefined) {
    let items = (args.items as Array<Record<string, unknown>>).map(toV2DocumentItem);

    // expAccountId cascades to every line as `account` (must be the ObjectId, not the account
    // code like "62000000" — verified live: ObjectId persists, account code is rejected).
    if (args.expAccountId !== undefined) {
      items = items.map((item) =>
        item.account !== undefined ? item : { ...item, account: args.expAccountId }
      );
    }

    // retention → per-line (best-effort; v2 has no root retention field)
    if (args.retention !== undefined) {
      items = items.map((item) => ({ ...item, retention: args.retention }));
    }

    body.items = items;
  }

  return body;
}

/**
 * Attach non-fatal `_warnings` to a tool result without dropping the original
 * payload. Holded frequently returns `{status:1, "Updated"}` even when it
 * silently ignored a field, so write tools re-GET and surface discrepancies
 * here rather than throwing (the write itself did happen).
 *
 * @param result - The raw Holded response.
 * @param warnings - Human-readable warnings to surface to the caller.
 * @returns The result unchanged when there are no warnings, otherwise the
 *   result augmented with a `_warnings` array.
 */
function attachWarnings<T>(result: T, warnings: string[]): T {
  if (warnings.length === 0) {
    return result;
  }
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as object), _warnings: warnings } as T;
  }
  return { value: result, _warnings: warnings } as unknown as T;
}

/**
 * Throw a clear, consistent error for operations that have no v2 equivalent.
 * Using `never` return type lets TypeScript understand this always throws, so
 * callers don't need explicit `return` after calling it.
 */
function unsupportedOp(operation: string, docType: string): never {
  throw new Error(`${operation} on ${docType} is not supported by the Holded API v2`);
}

/**
 * Document types that support pay_document in v2.
 * Source: annex tables 1.1–1.11 (pay column).
 */
const PAYABLE_DOC_TYPES = new Set([
  'invoice',
  'salesreceipt',
  'creditnote',
  'receiptnote',
  'purchase',
]);

/**
 * Document types that support send_document in v2.
 * purchase → NO EQUIVALENT (table 1.9); purchaserefund → entirely unsupported.
 */
const SENDABLE_DOC_TYPES = new Set([
  'invoice',
  'salesreceipt',
  'creditnote',
  'receiptnote',
  'estimate',
  'proform',
  'salesorder',
  'waybill',
  'purchaseorder',
]);

/**
 * Document types that support get_document_pdf in v2.
 * purchase → NO EQUIVALENT (table 1.9); purchaserefund → entirely unsupported.
 */
const PDF_DOC_TYPES = new Set([
  'invoice',
  'salesreceipt',
  'creditnote',
  'receiptnote',
  'estimate',
  'proform',
  'salesorder',
  'waybill',
  'purchaseorder',
]);

/**
 * Document types that support update_document_tracking in v2.
 * NOTE: The task brief says "NO EQUIVALENT for all types" but the normative
 * annex tables (1.7 salesorder, 1.8 waybill) explicitly list PUT .../tracking.
 * Per task instructions "annex wins" — tracking IS supported for these two types.
 */
const TRACKING_DOC_TYPES = new Set(['salesorder', 'waybill']);

export function getDocumentTools(client: HoldedClient) {
  return {
    // List Documents
    list_documents: {
      description:
        'List documents of a specific type (Holded API v2). Cursor-paginated: pass the previous response nextCursor as cursor. Response fields are snake_case; amounts are strings with decimal comma. NOTE: purchaserefund is not listable in v2 — only creation is supported (POST /purchases/refund).',
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
            description: 'Type of document to list',
          },
          limit: {
            type: 'number',
            description: 'Max items per page (server-paginated; use limit to control page size)',
          },
          cursor: {
            type: 'string',
            description: 'Cursor from a previous response nextCursor for the next page',
          },
          summary: {
            type: 'boolean',
            description: 'Return only count and pagination metadata without items (default: false)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Project only these fields per item (e.g. ["id", "contact_name", "total"]). Reduces response size.',
          },
        },
        required: ['docType'],
      },
      readOnlyHint: true,
      handler: async (args: {
        docType: DocumentType;
        limit?: number;
        cursor?: string;
        summary?: boolean;
        fields?: string[];
      }) => {
        const base = docBase(args.docType); // throws for purchaserefund
        const result = normalizeV2List(await client.get(base, cursorParams(args)));

        // Field filtering
        if (args.fields?.length) {
          result.items = (result.items as Array<Record<string, unknown>>).map((item) => {
            const picked: Record<string, unknown> = {};
            for (const f of args.fields as string[]) if (f in item) picked[f] = item[f];
            return picked;
          });
        }

        // Summary mode
        if (args.summary) {
          const out: Record<string, unknown> = { count: result.items.length };
          if (result.nextCursor) out.nextCursor = result.nextCursor;
          if (result.hasMore !== undefined) out.hasMore = result.hasMore;
          return out;
        }

        return result;
      },
    },

    // Create Document
    create_document: {
      description:
        'Create a new document (invoice, estimate, purchase, etc.). By default the document is approved (finalized) so it appears in the Holded UI; pass approveDoc:false to create a draft instead. Set the expense/income account at document level via `expAccountId` (it cascades to all lines); a per-line `account` is rejected because Holded ignores it. On SALES documents an auto-incrementing numbering series may OVERRIDE the requested `invoiceNum` — the tool re-reads the created document and returns a `_warnings` note if that happened. On purchases the supplier number in `invoiceNum` is preserved. `retention` (IRPF) is accepted on sales but rejected on purchases (Holded ignores it there).',
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
            description: 'Type of document to create',
          },
          contactId: {
            type: 'string',
            description: 'Contact ID for the document',
          },
          items: {
            type: 'array',
            description: 'Array of line items',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Product or service name' },
                units: { type: 'number', description: 'Quantity of units' },
                subtotal: {
                  type: 'number',
                  description: 'Line subtotal (price × units before tax/discount)',
                },
                desc: { type: 'string', description: 'Optional line description' },
                sku: { type: 'string', description: 'SKU / product reference code' },
                tax: {
                  type: 'number',
                  description: 'Tax percentage (0–100) — alternative to taxes array',
                },
                taxes: {
                  type: 'array',
                  description:
                    'Holded tax ID(s) for the line item (max 1 element). Use instead of tax when referencing a specific Holded tax definition.',
                  items: { type: 'string' },
                  minItems: 1,
                  maxItems: 1,
                },
                discount: { type: 'number', description: 'Discount percentage (0–100)' },
                serviceId: {
                  type: 'string',
                  description: 'Service ID to link to a Holded service catalog entry',
                },
              },
              required: ['name', 'units', 'subtotal'],
            },
          },
          date: {
            type: 'number',
            description: 'Document date as Unix timestamp',
          },
          notes: {
            type: 'string',
            description: 'Notes for the document',
          },
          currency: {
            type: 'string',
            description: 'Currency code (e.g., EUR, USD)',
          },
          invoiceNum: {
            type: 'string',
            description: 'Document reference number (e.g. invoice number from supplier)',
          },
          salesChannelId: {
            type: 'string',
            description: 'Sales channel ID to associate with the document',
          },
          expAccountId: {
            type: 'string',
            description: 'Expense account ID for expense documents',
          },
          approveDoc: {
            type: 'boolean',
            description:
              'Whether to immediately approve (finalize) the document instead of saving it as a draft. Defaults to true so the document is visible in the Holded UI. When the Holded API receives no value it defaults to draft, and drafts do not appear in Sales > Invoices, the contact Sales tab or global search. Pass false only when you intentionally want a draft. Note: approved documents are permanently locked by Holded.',
          },
          retention: {
            type: 'number',
            description:
              'IRPF retention percentage. Accepted on SALES documents only; rejected on purchases because Holded silently ignores it there.',
          },
        },
        required: ['docType', 'contactId', 'items', 'date'],
      },
      destructiveHint: true,
      handler: withValidation(createDocumentSchema, async (args) => {
        const { docType, approveDoc, ...rest } = args;
        // Map camelCase tool args → v2 snake_case body. approveDoc is defaulted here so
        // toV2DocumentBody always emits `draft` for creates (v2 defaults to draft mode).
        const body = toV2DocumentBody({ ...rest, approveDoc: approveDoc ?? true });
        // purchaserefund has a dedicated v2 endpoint; all others use their resource base path.
        const postPath = docType === 'purchaserefund' ? '/purchases/refund' : docBase(docType);
        const result = (await client.post(postPath, body)) as Record<string, unknown>;
        const warnings: string[] = [];
        // #17 — on sales documents a numbering series may override the requested
        // invoiceNum (now mapped to `number` in the v2 body). Re-read the created
        // document to confirm what actually stuck.
        if (body.number && !PURCHASE_DOC_TYPES.has(docType)) {
          const newId = typeof result?.id === 'string' ? result.id : undefined;
          if (newId) {
            try {
              const created = (await client.get(
                `${docBase(docType)}/${newId}`,
                undefined
              )) as Record<string, unknown>;
              const persisted =
                created?.invoiceNum ??
                created?.docNumber ??
                created?.invoice_num ??
                created?.doc_number ??
                created?.document_number;
              if (persisted !== undefined && persisted !== body.number) {
                warnings.push(
                  `Requested invoiceNum "${body.number}" was overridden by the numbering series to "${String(persisted)}".`
                );
              }
            } catch {
              // Best-effort verification; never fail a successful create on it.
            }
          }
        }
        return attachWarnings(result, warnings);
      }),
    },

    // Get Document
    get_document: {
      description: 'Get a specific document by ID',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
        },
        required: ['docType', 'documentId'],
      },
      readOnlyHint: true,
      handler: withValidation(documentIdSchema, async (args) => {
        return client.get(`${docBase(args.docType)}/${args.documentId}`, undefined);
      }),
    },

    // Get Document Payments (cross-year)
    get_document_payments: {
      description:
        'Get the payments registered against a specific document via the Holded API v2 GET endpoint. Returns `{ documentId, paymentsDetail }` when the v2 response includes a `paymentsDetail` field; otherwise returns the whole document (v2 field name may differ from v1). Unlike list_payments — which is filtered to the ACTIVE fiscal year — this surfaces payments from ANY year, so use it for cross-year payment audits. Read-only.',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
        },
        required: ['docType', 'documentId'],
      },
      readOnlyHint: true,
      handler: withValidation(documentIdSchema, async (args) => {
        const doc = (await client.get(
          `${docBase(args.docType)}/${args.documentId}`,
          undefined
        )) as Record<string, unknown>;
        // Return payments-related field if present; otherwise pass through whole document
        // (v2 field name may differ from v1 `paymentsDetail`).
        if ('paymentsDetail' in doc) {
          return {
            documentId: args.documentId,
            paymentsDetail: Array.isArray(doc.paymentsDetail) ? doc.paymentsDetail : [],
          };
        }
        return { documentId: args.documentId, ...doc };
      }),
    },

    // Update Document
    update_document: {
      description: 'Update an existing document',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID to update',
          },
          contactId: {
            type: 'string',
            description: 'Contact ID for the document',
          },
          items: {
            type: 'array',
            description: 'Array of line items',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Product or service name' },
                units: { type: 'number', description: 'Quantity of units' },
                subtotal: {
                  type: 'number',
                  description: 'Line subtotal (price × units before tax/discount)',
                },
                desc: { type: 'string', description: 'Optional line description' },
                sku: { type: 'string', description: 'SKU / product reference code' },
                tax: {
                  type: 'number',
                  description: 'Tax percentage (0–100) — alternative to taxes array',
                },
                taxes: {
                  type: 'array',
                  description:
                    'Holded tax ID(s) for the line item (max 1 element). Use instead of tax when referencing a specific Holded tax definition.',
                  items: { type: 'string' },
                  minItems: 1,
                  maxItems: 1,
                },
                discount: { type: 'number', description: 'Discount percentage (0–100)' },
                serviceId: {
                  type: 'string',
                  description: 'Service ID to link to a Holded service catalog entry',
                },
              },
              required: ['name', 'units', 'subtotal'],
            },
          },
          date: {
            type: 'number',
            description: 'Document date as Unix timestamp',
          },
          notes: {
            type: 'string',
            description: 'Notes for the document',
          },
          currency: {
            type: 'string',
            description: 'Currency code (e.g., EUR, USD)',
          },
          invoiceNum: {
            type: 'string',
            description: 'Document reference number (e.g. invoice number from supplier)',
          },
          salesChannelId: {
            type: 'string',
            description: 'Sales channel ID to associate with the document',
          },
          expAccountId: {
            type: 'string',
            description: 'Expense account ID for expense documents',
          },
          retention: {
            type: 'number',
            description:
              'IRPF retention percentage. Accepted on SALES documents only; rejected on purchases because Holded silently ignores it there.',
          },
        },
        required: ['docType', 'documentId'],
      },
      destructiveHint: true,
      handler: withValidation(updateDocumentSchema, async (args) => {
        const { docType, documentId, ...rest } = args;
        // Map camelCase tool args → v2 snake_case body. update_document has no `approveDoc`
        // in its schema, so toV2DocumentBody will NOT emit `draft` for updates.
        const body = toV2DocumentBody(rest);
        const result = (await client.put(`${docBase(docType)}/${documentId}`, body)) as Record<
          string,
          unknown
        >;
        const warnings: string[] = [];
        // #12 — Holded ignores `currency`/`currencyChange` on PUT; the document
        // keeps its original currency. Re-GET to confirm and warn if it didn't
        // change, so the caller doesn't assume an FX conversion that never ran.
        if (body.currency) {
          try {
            const current = (await client.get(
              `${docBase(docType)}/${documentId}`,
              undefined
            )) as Record<string, unknown>;
            const persisted = current?.currency;
            if (persisted !== undefined && persisted !== body.currency) {
              warnings.push(
                `Holded ignored the currency change to "${body.currency}" on update (still "${String(persisted)}"). Currency/FX can't be changed via the API — book in the target currency at the bank rate instead.`
              );
            } else if (persisted === undefined) {
              warnings.push(
                'Holded ignores currency/currencyChange on document update; the requested currency change may not have been applied. Verify in Holded.'
              );
            }
          } catch {
            // Best-effort verification; never fail a successful update on it.
          }
        }
        return attachWarnings(result, warnings);
      }),
    },

    // Delete Document
    delete_document: {
      description: 'Delete a document',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID to delete',
          },
        },
        required: ['docType', 'documentId'],
      },
      destructiveHint: true,
      handler: withValidation(documentIdSchema, async (args) => {
        return client.delete(`${docBase(args.docType)}/${args.documentId}`);
      }),
    },

    // Pay Document
    pay_document: {
      description:
        "Register a payment for a document (Holded API v2). Supported docTypes: invoice, salesreceipt, creditnote, receiptnote, purchase — others throw an unsupported error. IMPORTANT: this may AUTO-APPROVE the document as a side effect (status 0→1). `paymentmethod` is the payment-method catalog id (from list_payment_methods), NOT a bank/treasury id. To link the payment to a bank account, pass `bankId`: the /payments endpoint can't set it, so the tool performs a second step (PUT /payments/{id}) and reports the outcome in `_warnings`.",
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
          date: {
            type: 'number',
            description: 'Payment date as Unix timestamp',
          },
          amount: {
            type: 'number',
            description: 'Payment amount',
          },
          treasuryId: {
            type: 'string',
            description: 'Treasury account ID',
          },
          paymentmethod: {
            type: 'string',
            description:
              'Payment-method catalog id (from list_payment_methods), NOT a bank/treasury id.',
          },
          bankId: {
            type: 'string',
            description:
              'Bank account id to link the payment to. Triggers a second step (PUT /payments/{id}) to set the bank link on the payment.',
          },
        },
        required: ['docType', 'documentId', 'amount'],
      },
      destructiveHint: true,
      handler: withValidation(payDocumentSchema, async (args) => {
        const { docType, documentId, bankId, ...payBody } = args;
        if (!PAYABLE_DOC_TYPES.has(docType)) {
          unsupportedOp('pay_document', docType);
        }
        const base = docBase(docType);
        const result = (await client.post(`${base}/${documentId}/payments`, payBody)) as Record<
          string,
          unknown
        >;
        // #10 — paying may auto-approve the document; surface that clearly.
        const warnings: string[] = [
          'If the document was not yet approved, registering this payment auto-approved it (status 0→1). Holded has no API to approve without payment or to un-approve afterwards.',
        ];
        // #8 — the bank link is a separate step. Resolve the new payment id from
        // the document's paymentsDetail (v2 GET), then PUT /payments/{id} with bankId.
        if (bankId) {
          try {
            const doc = (await client.get(`${base}/${documentId}`, undefined)) as Record<
              string,
              unknown
            >;
            const paymentsData =
              (doc?.paymentsDetail as Array<{ id?: string }> | undefined) ??
              (doc?.payments_detail as Array<{ id?: string }> | undefined) ??
              (doc?.payments as Array<{ id?: string }> | undefined);
            const payments = Array.isArray(paymentsData) ? paymentsData : [];
            const newest = payments[payments.length - 1];
            if (newest?.id) {
              // #F1 — PUT /payments/{id} has replace semantics; merge over the
              // current payment record so amount/date/contact are not blanked.
              let paymentBase: Record<string, unknown> = {};
              try {
                const currentPayment = (await client.get(
                  `/payments/${newest.id}`,
                  undefined
                )) as Record<string, unknown>;
                if (
                  currentPayment &&
                  typeof currentPayment === 'object' &&
                  !Array.isArray(currentPayment)
                ) {
                  paymentBase = { ...currentPayment };
                  delete paymentBase.id;
                }
              } catch {
                // Fall back to bare bankId if payment read fails.
              }
              await client.put(`/payments/${newest.id}`, { ...paymentBase, bankId });
              warnings.push(`Linked bank account ${bankId} to payment ${newest.id}.`);
            } else {
              warnings.push(
                `Could not resolve the new payment id; set bankId ${bankId} manually via update_payment (PUT /payments/{id}).`
              );
            }
          } catch (error) {
            warnings.push(
              `Bank-link step failed: ${error instanceof Error ? error.message : String(error)}. The payment was registered but not linked to bankId ${bankId}.`
            );
          }
        }
        return attachWarnings(result, warnings);
      }),
    },

    // Send Document
    send_document: {
      description:
        'Send a document by email (Holded API v2). Supported docTypes: invoice, salesreceipt, creditnote, receiptnote, estimate, proform, salesorder, waybill, purchaseorder. purchase and purchaserefund are not supported in v2.',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
          emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of email addresses to send to',
          },
          subject: {
            type: 'string',
            description: 'Email subject',
          },
          message: {
            type: 'string',
            description: 'Email message body',
          },
        },
        required: ['docType', 'documentId'],
      },
      destructiveHint: true,
      handler: withValidation(sendDocumentSchema, async (args) => {
        const { docType, documentId, ...body } = args;
        if (!SENDABLE_DOC_TYPES.has(docType)) {
          unsupportedOp('send_document', docType);
        }
        return client.post(`${docBase(docType)}/${documentId}/send`, body);
      }),
    },

    // Get Document PDF
    get_document_pdf: {
      description:
        'Get the PDF of a document as base64-encoded binary (Holded API v2). ' +
        'Returns { contentType, base64, bytes, filename }. ' +
        'Supported docTypes: invoice, salesreceipt, creditnote, receiptnote, estimate, proform, salesorder, waybill, purchaseorder. ' +
        'purchase is NOT supported — GET /purchases/{id}/pdf returns 404 for all purchases. ' +
        'purchaserefund has no CRUD support in v2.',
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
              'purchaseorder',
            ],
            description: 'Type of document (purchase is not supported — PDF endpoint returns 404)',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
        },
        required: ['docType', 'documentId'],
      },
      readOnlyHint: true,
      handler: withValidation(documentIdSchema, async (args) => {
        if (!PDF_DOC_TYPES.has(args.docType)) {
          unsupportedOp('get_document_pdf', args.docType);
        }
        const binary = await client.getBinary(`${docBase(args.docType)}/${args.documentId}/pdf`);
        return { ...binary, filename: `${args.docType}-${args.documentId}.pdf` };
      }),
    },

    // Ship All Items
    ship_all_items: {
      description:
        'Ship all items of a document (Holded API v2). salesorder → POST /sales-orders/{id}/ship. purchaseorder → POST /purchase-orders/{id}/receive (receive from supplier). All other docTypes are not supported in v2.',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
        },
        required: ['docType', 'documentId'],
      },
      destructiveHint: true,
      handler: withValidation(documentIdSchema, async (args) => {
        const { docType, documentId } = args;
        if (docType === 'salesorder') {
          return client.post(`/sales-orders/${documentId}/ship`, undefined);
        }
        if (docType === 'purchaseorder') {
          // v2 renames "ship" to "receive" for purchase orders (from supplier POV)
          return client.post(`/purchase-orders/${documentId}/receive`, undefined);
        }
        unsupportedOp('ship_all_items', docType);
      }),
    },

    // Ship Items by Line
    ship_items_by_line: {
      description:
        'Ship specific items by line (Holded API v2). salesorder only → POST /sales-orders/{id}/ship-by-lines. purchaseorder line-level receive is UNVERIFIED in v2 and throws unsupported. All other docTypes are not supported.',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
          lines: {
            type: 'array',
            description: 'Array of line items to ship',
            items: {
              type: 'object',
              properties: {
                lineId: { type: 'string' },
                units: { type: 'number' },
              },
            },
          },
        },
        required: ['docType', 'documentId', 'lines'],
      },
      destructiveHint: true,
      handler: withValidation(shipItemsByLineSchema, async (args) => {
        const { docType, documentId, lines } = args;
        if (docType === 'salesorder') {
          // v2 has a dedicated ship-by-lines endpoint (v1 used same /ship with a `lines` body)
          return client.post(`/sales-orders/${documentId}/ship-by-lines`, { lines });
        }
        // purchaseorder receive-by-lines is UNVERIFIED in v2 → unsupported
        unsupportedOp('ship_items_by_line', docType);
      }),
    },

    // Get Shipped Units by Item
    get_shipped_units: {
      description:
        'Get shipped/received units for a document (Holded API v2). salesorder → GET /sales-orders/{id}/shipped-items. purchaseorder → GET /purchase-orders/{id}/received-items. All other docTypes are not supported.',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
        },
        required: ['docType', 'documentId'],
      },
      readOnlyHint: true,
      handler: withValidation(documentIdSchema, async (args) => {
        const { docType, documentId } = args;
        if (docType === 'salesorder') {
          return client.get(`/sales-orders/${documentId}/shipped-items`, undefined);
        }
        if (docType === 'purchaseorder') {
          return client.get(`/purchase-orders/${documentId}/received-items`, undefined);
        }
        unsupportedOp('get_shipped_units', docType);
      }),
    },

    // Attach File to Document
    attach_file_to_document: {
      description:
        'Attach a file to a document (Holded API v2). POST ${docBase}/{id}/attachments multipart. Supported for all docTypes except purchaserefund (v2 has no purchase-refund CRUD beyond creation).',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
          fileBase64: {
            type: 'string',
            description: 'File content as base64 encoded string',
          },
          filename: {
            type: 'string',
            description: 'Name of the file',
          },
        },
        required: ['docType', 'documentId', 'fileBase64', 'filename'],
      },
      destructiveHint: true,
      handler: withValidation(attachFileToDocumentSchema, async (args) => {
        const buffer = Buffer.from(args.fileBase64, 'base64');
        // docBase throws for purchaserefund (no v2 CRUD beyond creation)
        return client.uploadFile(
          `${docBase(args.docType)}/${args.documentId}/attachments`,
          buffer,
          args.filename
        );
      }),
    },

    // Update Tracking Info
    update_document_tracking: {
      description:
        'Update tracking information for a document (Holded API v2). Supported docTypes: salesorder (PUT /sales-orders/{id}/tracking) and waybill (PUT /waybills/{id}/tracking). All other types have NO EQUIVALENT in v2 and will throw an unsupported error. NOTE: this is a discrepancy with the task brief (which stated "all types unsupported") — the normative annex tables show salesorder and waybill do have tracking in v2.',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
          trackingNumber: {
            type: 'string',
            description: 'Tracking number',
          },
          carrier: {
            type: 'string',
            description: 'Carrier name',
          },
        },
        required: ['docType', 'documentId'],
      },
      destructiveHint: true,
      handler: withValidation(updateDocumentTrackingSchema, async (args) => {
        const { docType, documentId, ...body } = args;
        if (!TRACKING_DOC_TYPES.has(docType)) {
          unsupportedOp('update_document_tracking', docType);
        }
        // v2 changes the verb from POST to PUT (annex tables 1.7 and 1.8)
        return client.put(`${docBase(docType)}/${documentId}/tracking`, body);
      }),
    },

    // Update Pipeline
    update_document_pipeline: {
      description:
        'Update pipeline stage for a document (Holded API v2). Uses PUT — verb changed from POST in v1. Supported for all docTypes except purchaserefund (v2 limitation). Route: PUT ${docBase}/{id}/pipeline.',
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
            description: 'Type of document',
          },
          documentId: {
            type: 'string',
            description: 'Document ID',
          },
          pipelineId: {
            type: 'string',
            description: 'Pipeline ID',
          },
          stageId: {
            type: 'string',
            description: 'Stage ID within the pipeline',
          },
        },
        required: ['docType', 'documentId', 'pipelineId', 'stageId'],
      },
      destructiveHint: true,
      handler: withValidation(updateDocumentPipelineSchema, async (args) => {
        // docBase throws for purchaserefund (no v2 pipeline support there)
        // v2 changes the verb from POST to PUT (annex table 2.2)
        return client.put(`${docBase(args.docType)}/${args.documentId}/pipeline`, {
          pipelineId: args.pipelineId,
          stageId: args.stageId,
        });
      }),
    },

    // List Payment Methods
    list_payment_methods: {
      description:
        'List available payment methods (Holded API v2). GET /payment-methods. Returns an array of {id, name, type, status, isDefault, bankingAccountId} — the v2 {items:[...]} envelope is normalized to a bare array.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      readOnlyHint: true,
      handler: async () => {
        const response = await client.get<{ items?: unknown[] } | unknown[]>(
          '/payment-methods',
          undefined
        );
        // v2 returns {items:[...]} envelope; normalize to bare array for consistency
        if (
          response &&
          !Array.isArray(response) &&
          typeof response === 'object' &&
          'items' in response
        ) {
          return (response as { items: unknown[] }).items;
        }
        return response;
      },
    },
  };
}
