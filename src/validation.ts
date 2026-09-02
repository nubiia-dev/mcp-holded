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
  filename: z.string().min(1),
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
    /** Unit price — the Holded v2 field name. Preferred over the legacy `subtotal` alias. */
    price: z.number().optional(),
    /**
     * Legacy alias for `price`. Despite the name, Holded stores this as the UNIT
     * price, not the line total: 2 units at 258 means `subtotal: 258`.
     */
    subtotal: z.number().optional(),
    /** Optional line description */
    desc: z.string().optional(),
    /** Line type. A `title` line is a section heading and carries no amounts. */
    type: z.enum(['product', 'service', 'title']).optional(),
    /** SKU / product reference code */
    sku: z.string().optional(),
    /** Tax percentage (0–100) — alternative to `taxes` */
    tax: z.number().min(0).max(100).optional(),
    /**
     * Holded tax ids for the line, e.g. `["s_iva_21", "s_ret_19"]`. v2 accepts
     * SEVERAL taxes per line (VAT plus IRPF retention); an empty array is rejected.
     */
    taxes: z.array(z.string()).min(1).optional(),
    /** Discount percentage (0–100) */
    discount: z.number().min(0).max(100).optional(),
    /** Service ID to link the line to a Holded service catalog entry */
    serviceId: z.string().optional(),
    /** Product ID to link the line to a Holded product */
    productId: z.string().optional(),
    /**
     * Accounting account for this line, as the Holded ObjectId — NOT the PGC code.
     * Verified live: the ObjectId persists, a numeric account code is silently
     * dropped. Omit it to let the document-level `expAccountId` cascade instead.
     * Use it when lines need DIFFERENT accounts in the same document.
     */
    account: z
      .string({
        error:
          'A line-level `account` must be the Holded account ObjectId (a string); Holded silently drops a numeric PGC code such as 62900000.',
      })
      .optional(),
    /** Project ObjectId to link the line to a Holded project */
    projectId: z.string().optional(),
    /** IRPF retention percentage for this line; overrides the document-level cascade */
    retention: z.number().optional(),
    /** Tags to classify the line */
    tags: z.array(z.string()).optional(),
    /** Product weight for this line */
    weight: z.number().optional(),
    /** Cost price for this line */
    costPrice: z.number().optional(),
    /** Unit of measure for this line (e.g. kg, units, litros) */
    unitType: z.string().optional(),
  })
  .passthrough()
  .superRefine((item, ctx) => {
    if (item.price === undefined && item.subtotal === undefined && item.type !== 'title') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Each line needs a unit price: set `price` (or the legacy `subtotal` alias).',
      });
    }
  });

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
  /**
   * Payment-method catalog id (the `/paymentmethods` id), NOT a bank/treasury id.
   * Holded's `/pay` endpoint treats the payment method and the bank link as two
   * separate things — see `bankId`.
   */
  paymentmethod: z.string().optional(),
  /**
   * Bank/treasury account id to associate the resulting payment with. The `/pay`
   * endpoint does NOT accept this; the bank link can only be set via
   * `PUT /payments/{id}` afterwards, so `pay_document` performs that second step
   * when this is provided.
   */
  bankId: z.string().optional(),
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

/** Document types Holded treats as purchases (supplier-side documents). */
export const PURCHASE_DOC_TYPES = new Set<string>(['purchase', 'purchaserefund', 'purchaseorder']);

/**
 * Cross-field validation shared by create/update document schemas. Rejects two
 * silent-fail traps where Holded accepts a write but ignores the field, so the
 * caller never learns the value was dropped:
 *
 * - **#7** — a NUMERIC `account` on a line item (the PGC code, e.g. 62900000).
 *   Holded v2 does accept a line-level `account`, but only as the account
 *   ObjectId; a numeric code is silently dropped. Set `expAccountId` at document
 *   level to cascade one account to every line, or pass the ObjectId per line
 *   when the lines need different accounts.
 * - **#11** — `retention` (IRPF) on a purchase document. There is no API to set
 *   it on purchases (UI-only), so accepting it would report a false success.
 *
 * @param data - The parsed document payload.
 * @param ctx - Zod refinement context used to attach validation issues.
 */
function assertDocumentWriteSafety(
  data: { docType?: string; items?: Array<Record<string, unknown>>; retention?: number },
  ctx: z.RefinementCtx
): void {
  data.items?.forEach((item, index) => {
    if (item && typeof item === 'object' && 'account' in item && typeof item.account !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index, 'account'],
        message:
          'A line-level `account` must be the Holded account ObjectId (a string); Holded silently drops a numeric PGC code such as 62900000. Look the id up with list_expenses_accounts / get_chart_of_accounts, or set the account at document level via `expAccountId`.',
      });
    }
  });
  if (data.retention !== undefined && data.docType && PURCHASE_DOC_TYPES.has(data.docType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['retention'],
      message:
        'Holded ignores `retention` (IRPF) on purchase documents — it can only be set in the Holded UI. Remove it to avoid a false success, then set the retention manually.',
    });
  }
}

/**
 * A document date accepted by the write tools: either an ISO `YYYY-MM-DD` string
 * (what the Holded v2 API itself takes) or a Unix timestamp in seconds, kept for
 * backwards compatibility. Timestamps are converted to ISO in UTC, so prefer the
 * string form to avoid a day shift around midnight.
 */
export const documentDateSchema = z.union([
  z.number().int(),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date, YYYY-MM-DD'),
]);

/**
 * Root document fields shared by create_document and update_document. All optional,
 * all mapped to their Holded v2 snake_case counterparts in `toV2DocumentBody`.
 */
export const documentWriteFields = {
  /** Due date (ISO `YYYY-MM-DD` or Unix seconds) → `due_date` */
  dueDate: documentDateSchema.optional(),
  /** Free-text document description → `description` (the concept shown in Holded) */
  description: z.string().optional(),
  /** Custom field values, e.g. `[{ field: 'PROYECTO:', value: 'Oficina' }]` */
  customFields: z.array(z.object({ field: z.string().min(1), value: z.string() })).optional(),
  /** Numbering series ObjectId → `number_line_id` (get_numbering_series) */
  numberLineId: z.string().optional(),
  /** Default payment method ObjectId → `payment_method_id` */
  paymentMethodId: z.string().optional(),
  /** Document design template ObjectId → `design_id` */
  designId: z.string().optional(),
  /** Warehouse ObjectId → `warehouse_id` */
  warehouseId: z.string().optional(),
  /** ISO 639-1 language code, e.g. `es` */
  language: z.string().optional(),
  /** Rich content printed on the document → `body` */
  documentBody: z.string().optional(),
  /** Document-level tags */
  tags: z.array(z.string()).optional(),
  /** Global discount percentage applied to the document */
  discount: z.number().min(0).max(100).optional(),
  /** FX rate → `currency_change` */
  currencyChange: z.number().optional(),
};

export const createDocumentSchema = z
  .object({
    docType: docTypeEnum,
    contactId: z.string().min(1),
    items: z.array(documentItemSchema),
    /**
     * Document issue date: ISO `YYYY-MM-DD` (preferred) or a Unix timestamp in
     * seconds. Required by the Holded API — if omitted the request is rejected.
     */
    date: documentDateSchema,
    notes: z.string().optional(),
    currency: z.string().optional(),
    /** Document reference number (e.g. invoice number from supplier) */
    invoiceNum: z.string().optional(),
    ...documentWriteFields,
    /** Sales channel ID to associate with the document */
    salesChannelId: z.string().optional(),
    /** Expense account ID for expense documents */
    expAccountId: z.string().optional(),
    /**
     * Retention (IRPF) percentage. Valid on sales documents; rejected on
     * purchases, where Holded ignores it (UI-only). See {@link assertDocumentWriteSafety}.
     */
    retention: z.number().optional(),
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
  })
  .superRefine(assertDocumentWriteSafety);

export const updateDocumentSchema = documentIdSchema
  .merge(
    z.object({
      contactId: z.string().optional(),
      items: z.array(documentItemSchema).optional(),
      /**
       * Document date as Unix timestamp (integer).
       * Required by the Holded API when updating the date field.
       */
      date: documentDateSchema.optional(),
      notes: z.string().optional(),
      currency: z.string().optional(),
      /** Document reference number (e.g. invoice number from supplier) */
      invoiceNum: z.string().optional(),
      ...documentWriteFields,
      /** Sales channel ID to associate with the document */
      salesChannelId: z.string().optional(),
      /** Expense account ID for expense documents */
      expAccountId: z.string().optional(),
      /** Retention (IRPF) percentage. Rejected on purchases (see create). */
      retention: z.number().optional(),
    })
  )
  .superRefine(assertDocumentWriteSafety);

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
  /** Warehouse ID — required in v2 (v2 rejects stock updates without it). */
  warehouse_id: z.string().min(1),
  /** Stock delta (positive to add, negative to subtract). Replaces v1 `units`. */
  stock_variation: z.number(),
  /** Optional variant ID to target a specific product variant. */
  variant_id: z.string().optional(),
  /** Optional audit note describing the stock adjustment. */
  description: z.string().optional(),
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
  .merge(fieldFilteringSchema)
  .merge(z.object({ cursor: z.string().optional() }));

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

export const updatePaymentSchema = paymentIdSchema.merge(createPaymentSchema.partial()).merge(
  z.object({
    /**
     * Bank/treasury account id to link the payment to. `PUT /payments/{id}` is
     * how a payment gets associated with a bank (the `/pay` endpoint can't do
     * it).
     */
    bankId: z.string().optional(),
    /** Contact id. Re-sent on update because PUT /payments REPLACES the record. */
    contactId: z.string().optional(),
    /** Payment date as a Unix timestamp (seconds). */
    date: z.number().int().optional(),
    /** Payment amount. */
    amount: z.number().optional(),
  })
);

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
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(
    (s) => {
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    },
    { message: 'Invalid calendar date' }
  );

export const listProjectTimesSchema = z.object({
  /**
   * Restrict results to entries on or after this date (inclusive).
   * Applied client-side on the returned cursor page (v2 does not expose this
   * as a confirmed query parameter for /project-times).
   */
  startDate: isoDateSchema.optional(),
  /**
   * Restrict results to entries on or before this date (inclusive).
   * Applied client-side on the returned cursor page.
   */
  endDate: isoDateSchema.optional(),
  /**
   * When true, keep only approved entries (`approved === 1`).
   * Applied client-side on the returned cursor page.
   */
  approvedOnly: z.boolean().optional(),
  /** Max items per cursor page (v2 default: 50). */
  limit: z.number().int().positive().optional(),
  /** Cursor token from a previous response `nextCursor`. */
  cursor: z.string().optional(),
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
// get_daily_ledger now targets the Holded API v2 (`/ledger-entries`), which
// requires ISO date strings (`start_date`, `end_date`) rather than Unix
// timestamps. For backward compatibility the schema also accepts the legacy
// `starttmp`/`endtmp` fields (Unix seconds); the tool layer converts them via
// `toIsoDate`. At least one form of each bound must be supplied — the v2
// endpoint returns 422 without both dates.

export const dailyLedgerSchema = z.object({
  /** Range start as an ISO 8601 date string (YYYY-MM-DD), e.g. "2025-01-01". Primary form for v2. */
  start_date: z.string().optional(),
  /** Range end as an ISO 8601 date string (YYYY-MM-DD), e.g. "2025-12-31". Primary form for v2. */
  end_date: z.string().optional(),
  /** Range start as a Unix timestamp in seconds (legacy backward-compat form). Converted to ISO. */
  starttmp: z.number().optional(),
  /** Range end as a Unix timestamp in seconds (legacy backward-compat form). Converted to ISO. */
  endtmp: z.number().optional(),
  /**
   * When true, group ledger lines by `entryNumber` so each returned object is
   * a full double-entry journal entry (asiento) with its lines nested
   * (page-scoped — applies only to items on the current cursor page).
   */
  groupByEntry: z.boolean().optional(),
  /** Max items per cursor page (v2 default: 50, max: 100). */
  limit: z.number().int().positive().optional(),
  /** Cursor token from a previous response `nextCursor`. */
  cursor: z.string().optional(),
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
// ---------------------------------------------------------------------------
// Recurring invoices (facturas recurrentes) — Holded API v2 /recurring-invoices
// ---------------------------------------------------------------------------

/** Recurrence interval codes accepted by the v2 API. */
export const periodicityEnum = z.enum(['d', 'w', 'bw', 'm', 'bm', 'q', 'ba', 'a']);

// Dates on these endpoints are ISO `YYYY-MM-DD`; isoDateSchema above already
// validates the format and rejects impossible calendar dates.

export const recurringInvoiceIdSchema = z.object({
  recurringInvoiceId: z.string().min(1),
});

export const listRecurringInvoicesSchema = z
  .object({
    contactId: z.string().optional(),
    cursor: z.string().optional(),
  })
  .merge(paginationSchema)
  .merge(fieldFilteringSchema);

export const recurringScheduleSchema = recurringInvoiceIdSchema.merge(
  z.object({ until: isoDateSchema.optional() })
);

export const skipRecurringOccurrenceSchema = recurringInvoiceIdSchema.merge(
  z.object({ date: isoDateSchema.optional() })
);

/**
 * One line of a recurring invoice. The documented body is SMALLER than a regular
 * document line: no retention, weight, cost price or unit type. `.strict()` is
 * deliberate here, so a field the endpoint does not accept fails loudly instead
 * of being posted and dropped without trace.
 */
export const recurringItemSchema = z
  .object({
    name: z.string(),
    units: z.number(),
    price: z.number().optional(),
    /** Legacy alias for `price`; it is the UNIT price, not the line total. */
    subtotal: z.number().optional(),
    desc: z.string().optional(),
    type: z.enum(['product', 'service', 'title']).optional(),
    discount: z.number().min(0).max(100).optional(),
    taxes: z.array(z.string()).min(1).optional(),
    tags: z.array(z.string()).optional(),
    sku: z.string().optional(),
    account: z
      .string({
        error:
          'A line-level `account` must be the Holded account ObjectId (a string); Holded silently drops a numeric PGC code such as 70500000.',
      })
      .optional(),
    projectId: z.string().optional(),
    productId: z.string().optional(),
    serviceId: z.string().optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.price === undefined && item.subtotal === undefined && item.type !== 'title') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Each line needs a unit price: set `price` (or the legacy `subtotal` alias).',
      });
    }
  });

/** Root fields shared by the create and update schemas. */
const recurringWriteFields = {
  contactName: z.string().optional(),
  convertAutomatically: z.boolean().optional(),
  dueDays: z.number().int().optional(),
  contactPaymentDay: z.number().int().min(1).max(31).optional(),
  endDate: isoDateSchema.optional(),
  date: isoDateSchema.optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  documentBody: z.string().optional(),
  language: z.string().optional(),
  currency: z.string().optional(),
  currencyChange: z.number().optional(),
  tags: z.array(z.string()).optional(),
  numberLineId: z.string().optional(),
  discount: z.number().min(0).max(100).optional(),
  designId: z.string().optional(),
  /** Cascaded to every line as `account`; a line with its own account keeps it. */
  expAccountId: z.string().optional(),
};

export const createRecurringInvoiceSchema = z.object({
  contactId: z.string().min(1),
  periodicity: periodicityEnum,
  items: z.array(recurringItemSchema).min(1),
  ...recurringWriteFields,
});

export const updateRecurringInvoiceSchema = recurringInvoiceIdSchema.merge(
  z.object({
    contactId: z.string().optional(),
    periodicity: periodicityEnum.optional(),
    items: z.array(recurringItemSchema).min(1).optional(),
    ...recurringWriteFields,
  })
);

export function withValidation<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  handler: (args: TInput) => Promise<TOutput>
) {
  return async (args: unknown): Promise<TOutput> => {
    const validatedArgs = validateInput(schema, args);
    return handler(validatedArgs);
  };
}
