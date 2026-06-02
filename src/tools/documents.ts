import { HoldedClient } from '../holded-client.js';
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
  withValidation,
} from '../validation.js';

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

/** Document types Holded treats as purchases (supplier-side documents). */
const PURCHASE_DOC_TYPES = new Set<DocumentType>(['purchase', 'purchaserefund', 'purchaseorder']);

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

export function getDocumentTools(client: HoldedClient) {
  return {
    // List Documents
    list_documents: {
      description:
        'List all documents of a specific type with optional filters for date range, contact, payment status, approval, and sorting. Supports field filtering to reduce response size. NOTE: a document carries three INDEPENDENT and sometimes-conflicting flags — (1) the stored Paid/Pending badge `status` (set when the document is imported, NOT recomputed), (2) the real outstanding amount `paymentsPending` (the authoritative math), and (3) approval (filter with `approved`). A document can be badge-Paid, math-unpaid, and not-approved all at once, so check the flag you actually mean.',
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
          starttmp: {
            type: 'string',
            description: 'Starting timestamp (Unix timestamp) for filtering documents by date',
          },
          endtmp: {
            type: 'string',
            description: 'Ending timestamp (Unix timestamp) for filtering documents by date',
          },
          contactid: {
            type: 'string',
            description: 'Filter documents by contact ID',
          },
          paid: {
            type: 'string',
            enum: ['0', '1', '2'],
            description: 'Filter by payment status: 0=not paid, 1=paid, 2=partially paid',
          },
          billed: {
            type: 'string',
            enum: ['0', '1'],
            description: 'Filter by billed status: 0=not billed, 1=billed',
          },
          approved: {
            type: 'string',
            enum: ['0', '1'],
            description:
              'Filter by approval state: 0=not approved, 1=approved. Maps to Holded `filter=approved-<n>`. Independent of the Paid/Pending badge and of paymentsPending.',
          },
          sort: {
            type: 'string',
            enum: ['created-asc', 'created-desc'],
            description: 'Sort order by creation date',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Select specific fields to return (e.g., ["id", "contactName", "total"]). Reduces response size by 70-90%. If not provided, returns default fields: id, contact, contactName, date, tax, total, status, paymentsPending',
          },
        },
        required: ['docType'],
      },
      readOnlyHint: true,
      handler: async (args: {
        docType: DocumentType;
        page?: number;
        limit?: number;
        summary?: boolean;
        starttmp?: string;
        endtmp?: string;
        contactid?: string;
        paid?: string;
        billed?: string;
        approved?: string;
        sort?: string;
        fields?: string[];
      }) => {
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
        if (args.contactid) queryParams.contactid = args.contactid;
        if (args.paid) queryParams.paid = args.paid;
        if (args.billed) queryParams.billed = args.billed;
        // #16 — approval is a separate flag exposed via `filter=approved-<n>`.
        if (args.approved) queryParams.filter = `approved-${args.approved}`;
        if (args.sort) queryParams.sort = args.sort;
        const result = await client.get(`/documents/${args.docType}`, queryParams);
        // Filter to return only essential fields
        if (Array.isArray(result)) {
          // Field filtering: if fields specified, return only those fields
          // Otherwise, return default minimal set. `status` is the stored
          // Paid/Pending badge; `paymentsPending` is the authoritative
          // outstanding-amount math — both are surfaced by default (#16).
          const defaultFields = [
            'id',
            'contact',
            'contactName',
            'date',
            'tax',
            'total',
            'status',
            'paymentsPending',
          ];
          const fieldsToInclude =
            args.fields && args.fields.length > 0 ? args.fields : defaultFields;

          const filtered = result.map((doc: Record<string, unknown>) => {
            const resultDoc: Record<string, unknown> = {};
            for (const field of fieldsToInclude) {
              if (field in doc) {
                resultDoc[field] = doc[field];
              }
            }
            return resultDoc;
          });

          // Virtual pagination: control context by returning only a window of data
          const page = args.page ?? 1;
          const limit = Math.min(args.limit ?? 50, 500);

          // Calculate pagination window
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const items = filtered.slice(startIndex, endIndex);

          // Summary mode: return only count and metadata
          if (args.summary) {
            return {
              count: filtered.length,
              totalPages: Math.ceil(filtered.length / limit),
              currentPage: page,
              hasMore: endIndex < filtered.length,
            };
          }

          return {
            items,
            page,
            pageSize: items.length,
            totalItems: filtered.length,
            totalPages: Math.ceil(filtered.length / limit),
            hasMore: endIndex < filtered.length,
          };
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
        },
        required: ['docType', 'contactId', 'items', 'date'],
      },
      destructiveHint: true,
      handler: withValidation(createDocumentSchema, async (args) => {
        const { docType, approveDoc, ...rest } = args;
        const body = { ...rest, approveDoc: approveDoc ?? true };
        const result = (await client.post(`/documents/${docType}`, body)) as Record<
          string,
          unknown
        >;
        const warnings: string[] = [];
        // #17 — on sales documents a numbering series may override the requested
        // invoiceNum. Re-read the created document to confirm what actually stuck.
        if (body.invoiceNum && !PURCHASE_DOC_TYPES.has(docType)) {
          const newId = typeof result?.id === 'string' ? result.id : undefined;
          if (newId) {
            try {
              const created = (await client.get(`/documents/${docType}/${newId}`)) as Record<
                string,
                unknown
              >;
              const persisted = created?.invoiceNum ?? created?.docNumber;
              if (persisted !== undefined && persisted !== body.invoiceNum) {
                warnings.push(
                  `Requested invoiceNum "${body.invoiceNum}" was overridden by the numbering series to "${String(persisted)}".`
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
        return client.get(`/documents/${args.docType}/${args.documentId}`);
      }),
    },

    // Get Document Payments (cross-year)
    get_document_payments: {
      description:
        "Get the payments registered against a specific document, read directly from the document's `paymentsDetail`. Unlike list_payments — which is filtered to the ACTIVE fiscal year — this surfaces payments from ANY year, so use it for cross-year payment audits (e.g. an invoice dated last year that was paid this year). Returns `{ documentId, paymentsDetail }`. Read-only.",
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
        const doc = (await client.get(`/documents/${args.docType}/${args.documentId}`)) as {
          paymentsDetail?: unknown;
        };
        return {
          documentId: args.documentId,
          paymentsDetail: Array.isArray(doc?.paymentsDetail) ? doc.paymentsDetail : [],
        };
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
        },
        required: ['docType', 'documentId'],
      },
      destructiveHint: true,
      handler: withValidation(updateDocumentSchema, async (args) => {
        const { docType, documentId, ...body } = args;
        const result = (await client.put(`/documents/${docType}/${documentId}`, body)) as Record<
          string,
          unknown
        >;
        const warnings: string[] = [];
        // #12 — Holded ignores `currency`/`currencyChange` on PUT; the document
        // keeps its original currency. Re-GET to confirm and warn if it didn't
        // change, so the caller doesn't assume an FX conversion that never ran.
        if (body.currency) {
          try {
            const current = (await client.get(`/documents/${docType}/${documentId}`)) as Record<
              string,
              unknown
            >;
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
        return client.delete(`/documents/${args.docType}/${args.documentId}`);
      }),
    },

    // Pay Document
    pay_document: {
      description:
        "Register a payment for a document. IMPORTANT: this AUTO-APPROVES the document as a side effect (status 0→1) — Holded has no separate approve endpoint, and approval cannot be undone via the API. `paymentmethod` is the payment-method catalog id (from list_payment_methods), NOT a bank/treasury id. To link the payment to a bank account, pass `bankId`: the /pay endpoint can't set it, so the tool performs a second step (PUT /payments/{id}) and reports the outcome in `_warnings`.",
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
              'Bank account id to link the payment to. Triggers a second step (PUT /payments/{id}) because /pay cannot set the bank link.',
          },
        },
        required: ['docType', 'documentId', 'amount'],
      },
      destructiveHint: true,
      handler: withValidation(payDocumentSchema, async (args) => {
        const { docType, documentId, bankId, ...payBody } = args;
        const result = (await client.post(
          `/documents/${docType}/${documentId}/pay`,
          payBody
        )) as Record<string, unknown>;
        // #10 — paying always auto-approves the document; surface that clearly.
        const warnings: string[] = [
          'Registering a payment auto-approved the document (status 0→1). Holded has no API to approve without payment or to un-approve afterwards.',
        ];
        // #8 — the bank link is a separate step. Resolve the new payment id from
        // the document's paymentsDetail, then PUT /payments/{id} with bankId.
        if (bankId) {
          try {
            const doc = (await client.get(`/documents/${docType}/${documentId}`)) as {
              paymentsDetail?: Array<{ id?: string }>;
            };
            const payments = Array.isArray(doc?.paymentsDetail) ? doc.paymentsDetail : [];
            const newest = payments[payments.length - 1];
            if (newest?.id) {
              await client.put(`/payments/${newest.id}`, { bankId });
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
      description: 'Send a document by email',
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
        return client.post(`/documents/${docType}/${documentId}/send`, body);
      }),
    },

    // Get Document PDF
    get_document_pdf: {
      description: 'Get the PDF of a document',
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
        return client.get(`/documents/${args.docType}/${args.documentId}/pdf`);
      }),
    },

    // Ship All Items
    ship_all_items: {
      description: 'Ship all items of a document',
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
        return client.post(`/documents/${args.docType}/${args.documentId}/ship`);
      }),
    },

    // Ship Items by Line
    ship_items_by_line: {
      description: 'Ship specific items by line',
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
        return client.post(`/documents/${args.docType}/${args.documentId}/ship`, {
          lines: args.lines,
        });
      }),
    },

    // Get Shipped Units by Item
    get_shipped_units: {
      description: 'Get shipped units by item for a document',
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
        return client.get(`/documents/${args.docType}/${args.documentId}/shipped`);
      }),
    },

    // Attach File to Document
    attach_file_to_document: {
      description: 'Attach a file to a document',
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
        return client.uploadFile(
          `/documents/${args.docType}/${args.documentId}/attach`,
          buffer,
          args.filename
        );
      }),
    },

    // Update Tracking Info
    update_document_tracking: {
      description: 'Update tracking information for a document',
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
        return client.post(`/documents/${docType}/${documentId}/tracking`, body);
      }),
    },

    // Update Pipeline
    update_document_pipeline: {
      description: 'Update pipeline stage for a document',
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
        return client.post(`/documents/${args.docType}/${args.documentId}/pipeline`, {
          pipelineId: args.pipelineId,
          stageId: args.stageId,
        });
      }),
    },

    // List Payment Methods
    list_payment_methods: {
      description: 'List available payment methods',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      readOnlyHint: true,
      handler: async () => {
        return client.get('/paymentmethods');
      },
    },
  };
}
