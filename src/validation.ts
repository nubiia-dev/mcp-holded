import { z } from 'zod';

/**
 * Common validation schemas
 */

/**
 * Shared enum of all document types supported by the Holded API.
 *
 * Using a single shared constant ensures every schema that references document
 * types stays in sync automatically. Adding a new document type here
 * propagates to ALL schemas that use `docTypeEnum` — no risk of partial updates.
 *
 * @example
 *   docTypeEnum.parse('invoice');   // OK
 *   docTypeEnum.parse('unknown');   // throws ZodError
 */
export const docTypeEnum = z.enum([
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
]);

// Pagination schemas
export const paginationSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(500).optional(),
  limit: z.number().int().positive().max(500).optional(),
  summary: z.boolean().optional(),
});

// Field filtering schema
export const fieldFilteringSchema = z.object({
  fields: z.array(z.string()).optional(),
});

// Date filtering schemas
export const dateRangeSchema = z.object({
  starttmp: z.string().optional(),
  endtmp: z.string().optional(),
});

// Contact schemas
export const contactIdSchema = z.object({
  contactId: z.string().min(1),
});

export const contactPersonSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

export const createContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  /**
   * NIF/CIF/VAT identifier for the contact. This is the correct Holded API field
   * for tax identification numbers. The legacy `vatnumber` field does not exist in
   * the Holded API and is silently ignored — use `code` instead.
   */
  code: z.string().optional(),
  type: z.enum(['client', 'supplier', 'lead', 'debtor', 'creditor']).optional(),
  billAddress: z
    .object({
      address: z.string().optional(),
      city: z.string().optional(),
      postalCode: z.string().optional(),
      province: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  tradename: z.string().optional(),
  note: z.string().optional(),
  /**
   * List of contact persons associated with this contact.
   * Each person requires a name; phone and email are optional.
   */
  contactPersons: z.array(contactPersonSchema).optional(),
});

export const updateContactSchema = contactIdSchema.merge(createContactSchema.partial());

export const contactAttachmentSchema = z.object({
  contactId: z.string().min(1),
  attachmentId: z.string().min(1),
});

/**
 * Schema for a single line item within a document.
 *
 * Required fields: name, units, subtotal.
 * Optional fields: desc, sku, tax (percentage), taxes (Holded tax IDs),
 * discount, serviceId.
 *
 * Uses `.passthrough()` to allow additional fields not listed here, ensuring
 * forward compatibility with Holded API changes.
 */
export const documentItemSchema = z
  .object({
    /** Product or service name shown on the document line */
    name: z.string(),
    /** Quantity of units */
    units: z.number(),
    /** Line subtotal (price × units before tax/discount) */
    subtotal: z.number(),
    /** Optional line description */
    desc: z.string().optional(),
    /** SKU / product reference code */
    sku: z.string().optional(),
    /** Tax percentage (0–100) — alternative to `taxes` */
    tax: z.number().min(0).max(100).optional(),
    /**
     * Holded tax ID(s) for the line item.
     * Accepts exactly 1 tax ID when provided; an empty array is rejected.
     * Use this instead of `tax` when you need to reference a specific Holded tax definition.
     */
    taxes: z.array(z.string()).min(1).max(1).optional(),
    /** Discount percentage (0–100) */
    discount: z.number().min(0).max(100).optional(),
    /** Service ID to link the line to a Holded service catalog entry */
    serviceId: z.string().optional(),
  })
  .passthrough();

// Document schemas
export const documentIdSchema = z.object({
  docType: docTypeEnum,
  documentId: z.string().min(1),
});

export const listDocumentsSchema = z
  .object({
    docType: docTypeEnum,
  })
  .merge(paginationSchema)
  .merge(fieldFilteringSchema)
  .merge(dateRangeSchema);

export const updateDocumentPipelineSchema = z.object({
  docType: docTypeEnum,
  documentId: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
});

export const attachFileToDocumentSchema = z.object({
  docType: docTypeEnum,
  documentId: z.string().min(1),
  fileBase64: z.string().min(1),
  filename: z.string().min(1),
});

export const shipItemsByLineSchema = z.object({
  docType: docTypeEnum,
  documentId: z.string().min(1),
  lines: z.array(z.unknown()),
});

export const payDocumentSchema = z.object({
  docType: docTypeEnum,
  documentId: z.string().min(1),
  amount: z.number().nonnegative().optional(),
  /** Payment date as Unix timestamp integer. */
  date: z.number().int().optional(),
  treasuryId: z.string().optional(),
});

export const sendDocumentSchema = z.object({
  docType: docTypeEnum,
  documentId: z.string().min(1),
  emails: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
});

export const updateDocumentTrackingSchema = z.object({
  docType: docTypeEnum,
  documentId: z.string().min(1),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
});

export const createDocumentSchema = z.object({
  docType: docTypeEnum,
  contactId: z.string().min(1),
  items: z.array(documentItemSchema),
  /**
   * Document date as Unix timestamp (integer). Required by the Holded API.
   * If omitted, Holded will reject the request. Use Math.floor(Date.now() / 1000)
   * to get the current timestamp.
   */
  date: z.number().int(),
  notes: z.string().optional(),
  currency: z.string().optional(),
  /** Document reference number (e.g. invoice number from supplier) */
  invoiceNum: z.string().optional(),
  /** Sales channel ID to associate with the document */
  salesChannelId: z.string().optional(),
  /** Expense account ID for expense documents */
  expAccountId: z.string().optional(),
  /**
   * Whether to immediately approve (finalize) the document instead of saving it as a draft.
   *
   * Defaults to `true` so created documents are visible in the Holded UI by default. When
   * omitted, the Holded API itself defaults to `false` (draft), and drafts are hidden from
   * the standard Sales > Invoices list, the contact's Sales tab and global search — they
   * exist but are not reachable from the UI.
   *
   * Pass `false` explicitly only when you intentionally want a draft for later review.
   *
   * Note: once a document is approved it is permanently locked by Holded and cannot be
   * deleted or freely edited.
   */
  approveDoc: z.boolean().optional(),
});

export const updateDocumentSchema = documentIdSchema.merge(
  z.object({
    contactId: z.string().optional(),
    items: z.array(documentItemSchema).optional(),
    /**
     * Document date as Unix timestamp (integer).
     * Required by the Holded API when updating the date field.
     */
    date: z.number().int().optional(),
    notes: z.string().optional(),
    currency: z.string().optional(),
    /** Document reference number (e.g. invoice number from supplier) */
    invoiceNum: z.string().optional(),
    /** Sales channel ID to associate with the document */
    salesChannelId: z.string().optional(),
    /** Expense account ID for expense documents */
    expAccountId: z.string().optional(),
  })
);

// Product schemas
export const productIdSchema = z.object({
  productId: z.string().min(1),
});

export const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  tax: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  stock: z.number().optional(),
  kind: z.enum(['product', 'service']).optional(),
});

export const updateProductSchema = productIdSchema.merge(createProductSchema.partial());

export const productImageSchema = z.object({
  productId: z.string().min(1),
  imageId: z.string().min(1),
});

export const updateProductStockSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().optional(),
  units: z.number().int(),
});

// Treasury schemas
export const treasuryIdSchema = z.object({
  treasuryId: z.string().min(1),
});

export const createTreasurySchema = z.object({
  name: z.string().min(1),
  iban: z.string().optional(),
  bic: z.string().optional(),
  balance: z.number().optional(),
});

// Warehouse schemas
export const warehouseIdSchema = z.object({
  warehouseId: z.string().min(1),
});

export const createWarehouseSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
});

export const updateWarehouseSchema = warehouseIdSchema.merge(createWarehouseSchema.partial());

export const warehouseStockSchema = warehouseIdSchema
  .merge(paginationSchema)
  .merge(fieldFilteringSchema);

// Service schemas
export const serviceIdSchema = z.object({
  serviceId: z.string().min(1),
});

export const createServiceSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  price: z.number().nonnegative().optional(),
  tax: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
});

export const updateServiceSchema = serviceIdSchema.merge(createServiceSchema.partial());

// Payment schemas
export const paymentIdSchema = z.object({
  paymentId: z.string().min(1),
});

export const createPaymentSchema = z.object({
  name: z.string().min(1),
  days: z.number().int().nonnegative().optional(),
});

export const updatePaymentSchema = paymentIdSchema.merge(createPaymentSchema.partial());

// Numbering series schemas
export const numberingSerieIdSchema = z.object({
  docType: docTypeEnum,
  serieId: z.string().min(1),
});

export const createNumberingSerieSchema = z.object({
  docType: docTypeEnum,
  name: z.string().min(1),
  prefix: z.string().optional(),
  nextNumber: z.number().int().positive().optional(),
});

export const updateNumberingSerieSchema = numberingSerieIdSchema.merge(
  createNumberingSerieSchema.partial().omit({ docType: true })
);

// Time-tracking (Projects API) schemas
//
// The Projects API returns dates as Unix timestamps (seconds, local midnight)
// and durations in seconds. The optional date filters below accept `YYYY-MM-DD`
// strings so callers don't have to compute timestamps themselves; the tool layer
// converts them when comparing against each entry's `date`.

/** ISO calendar date in `YYYY-MM-DD` form (e.g. `2026-03-31`). */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const listProjectTimesSchema = z.object({
  /** Restrict results to entries on or after this date (inclusive). */
  startDate: isoDateSchema.optional(),
  /** Restrict results to entries on or before this date (inclusive). */
  endDate: isoDateSchema.optional(),
  /** When true, keep only approved entries (`approved === 1`). */
  approvedOnly: z.boolean().optional(),
  /**
   * When true, return a flat array of time entries (each enriched with its
   * project id/name) instead of the nested per-project structure. Convenient
   * for summing hours across a month.
   */
  flatten: z.boolean().optional(),
});

export const projectTimesSchema = z
  .object({
    projectId: z.string().min(1),
  })
  .merge(listProjectTimesSchema);

export const projectTimeIdSchema = z.object({
  projectId: z.string().min(1),
  timeTrackingId: z.string().min(1),
});

// Accounting (read-only) schemas
//
// The accounting API works in Unix-second timestamps. The daily ledger rejects
// ranges longer than one year server-side (HTTP 400 "Maximum 1 year between
// start and end"); we validate that client-side to fail fast with a clear error.

/** Maximum span the daily-ledger endpoint accepts, in seconds (~1 leap year). */
const MAX_LEDGER_RANGE_SECONDS = 366 * 24 * 60 * 60;

export const dailyLedgerSchema = z
  .object({
    /** Range start as a Unix timestamp (seconds). */
    starttmp: z.number().int().nonnegative(),
    /** Range end as a Unix timestamp (seconds). */
    endtmp: z.number().int().nonnegative(),
    /**
     * When true, group ledger lines by `entryNumber` so each returned object is
     * a full double-entry journal entry (asiento) with its lines nested.
     */
    groupByEntry: z.boolean().optional(),
  })
  .refine((v) => v.endtmp >= v.starttmp, {
    message: 'endtmp must be greater than or equal to starttmp',
    path: ['endtmp'],
  })
  .refine((v) => v.endtmp - v.starttmp <= MAX_LEDGER_RANGE_SECONDS, {
    message: 'Date range must not exceed 1 year (Holded rejects longer spans)',
    path: ['endtmp'],
  });

/**
 * Validation utility function
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues
        .map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      throw new Error(`Validation error: ${formattedErrors}`);
    }
    throw error;
  }
}

/**
 * Type-safe validation wrapper for tool handlers
 */
export function withValidation<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  handler: (args: TInput) => Promise<TOutput>
) {
  return async (args: unknown): Promise<TOutput> => {
    const validatedArgs = validateInput(schema, args);
    return handler(validatedArgs);
  };
}
