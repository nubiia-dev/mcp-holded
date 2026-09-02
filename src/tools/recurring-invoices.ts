import { HoldedClient } from '../holded-client.js';
import { normalizeV2List, cursorParams } from '../utils/v2-pagination.js';
import {
  recurringInvoiceIdSchema,
  listRecurringInvoicesSchema,
  createRecurringInvoiceSchema,
  updateRecurringInvoiceSchema,
  recurringScheduleSchema,
  skipRecurringOccurrenceSchema,
  withValidation,
} from '../validation.js';

/** v2 resource base path for recurring invoices. */
const BASE = '/recurring-invoices';

/**
 * Periodicity codes accepted by the v2 API, with their meaning. Holded returns
 * the same codes on read (a monthly recurrence reads back as `m`).
 */
export const PERIODICITY_CODES = {
  d: 'daily',
  w: 'weekly',
  bw: 'biweekly',
  m: 'monthly',
  bm: 'bimonthly',
  q: 'quarterly',
  ba: 'biannual',
  a: 'annual',
} as const;

/**
 * Map a tool line item (camelCase) to a v2 recurring-invoice line (snake_case).
 *
 * The recurring endpoint documents a SMALLER line than a regular document: no
 * retention, weight, cost price or unit type. Only the documented fields are
 * forwarded, so a stray field can't be silently accepted and then dropped.
 *
 * Mapping table:
 *   name → name | type → type | desc → description | units → units
 *   price → price (`subtotal` is accepted as the legacy alias, also a UNIT price)
 *   discount → discount | taxes → taxes | tags → tags | sku → sku
 *   account → account (ObjectId) | projectId → project_id
 *   productId → product_id | serviceId → service_id
 */
export function toV2RecurringItem(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (item.name !== undefined) out.name = item.name;
  if (item.type !== undefined) out.type = item.type;
  if (item.desc !== undefined) out.description = item.desc;
  if (item.units !== undefined) out.units = item.units;
  if (item.subtotal !== undefined) out.price = item.subtotal;
  if (item.price !== undefined) out.price = item.price;
  if (item.discount !== undefined) out.discount = item.discount;
  if (item.taxes !== undefined) out.taxes = item.taxes;
  if (item.tags !== undefined) out.tags = item.tags;
  if (item.sku !== undefined) out.sku = item.sku;
  if (item.account !== undefined) out.account = item.account;
  if (item.projectId !== undefined) out.project_id = item.projectId;
  if (item.productId !== undefined) out.product_id = item.productId;
  if (item.serviceId !== undefined) out.service_id = item.serviceId;
  return out;
}

/**
 * Map the tool's camelCase write args to the v2 recurring-invoice request body.
 *
 * Root field mapping (tool arg → v2 body field):
 *   contactId → contact_id | contactName → contact_name | periodicity → periodicity
 *   convertAutomatically → convert_automatically | dueDays → due_days
 *   contactPaymentDay → contact_payment_day | endDate → end_date
 *   description → description | date → date | notes → notes
 *   documentBody → body | language → language | currency → currency
 *   currencyChange → currency_change | tags → tags
 *   numberLineId → number_line_id | discount → discount | designId → design_id
 *   expAccountId → NOT in the root body; cascaded to every line as `account`
 *   items → each line mapped via toV2RecurringItem
 */
export function toV2RecurringBody(args: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (args.contactId !== undefined) body.contact_id = args.contactId;
  if (args.contactName !== undefined) body.contact_name = args.contactName;
  if (args.periodicity !== undefined) body.periodicity = args.periodicity;
  if (args.convertAutomatically !== undefined)
    body.convert_automatically = args.convertAutomatically;
  if (args.dueDays !== undefined) body.due_days = args.dueDays;
  if (args.contactPaymentDay !== undefined) body.contact_payment_day = args.contactPaymentDay;
  if (args.endDate !== undefined) body.end_date = args.endDate;
  if (args.description !== undefined) body.description = args.description;
  if (args.date !== undefined) body.date = args.date;
  if (args.notes !== undefined) body.notes = args.notes;
  if (args.documentBody !== undefined) body.body = args.documentBody;
  if (args.language !== undefined) body.language = args.language;
  if (args.currency !== undefined) body.currency = args.currency;
  if (args.currencyChange !== undefined) body.currency_change = args.currencyChange;
  if (args.tags !== undefined) body.tags = args.tags;
  if (args.numberLineId !== undefined) body.number_line_id = args.numberLineId;
  if (args.discount !== undefined) body.discount = args.discount;
  if (args.designId !== undefined) body.design_id = args.designId;

  if (args.items !== undefined) {
    let items = (args.items as Array<Record<string, unknown>>).map(toV2RecurringItem);
    // expAccountId cascades to every line as `account` (ObjectId, not the PGC code),
    // the same contract as create_document. A line with its own account keeps it.
    if (args.expAccountId !== undefined) {
      items = items.map((item) =>
        item.account !== undefined ? item : { ...item, account: args.expAccountId }
      );
    }
    body.items = items;
  }

  return body;
}

/** Line-item JSON schema shared by the create and update tools. */
const RECURRING_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Product or service name' },
    units: { type: 'number', description: 'Quantity of units' },
    price: { type: 'number', description: 'UNIT price. 2 units at 258 → price 258' },
    subtotal: {
      type: 'number',
      description: 'Legacy alias for price. Also the UNIT price, not the line total.',
    },
    desc: { type: 'string', description: 'Line description' },
    type: {
      type: 'string',
      enum: ['product', 'service', 'title'],
      description: 'Line type. A title line is a heading and carries no amounts.',
    },
    discount: { type: 'number', description: 'Discount percentage (0–100)' },
    taxes: {
      type: 'array',
      description:
        'Holded tax ids for the line, e.g. ["s_iva_21", "s_ret_19"]. Several taxes per line are allowed.',
      items: { type: 'string' },
      minItems: 1,
    },
    tags: { type: 'array', items: { type: 'string' }, description: 'Tags to classify the line' },
    sku: { type: 'string', description: 'SKU / product reference code' },
    account: {
      type: 'string',
      description:
        'Accounting account for THIS line, as the Holded ObjectId (never the PGC code, which Holded drops)',
    },
    projectId: { type: 'string', description: 'Project ObjectId for this line' },
    productId: { type: 'string', description: 'Product ObjectId to link' },
    serviceId: { type: 'string', description: 'Service ObjectId to link' },
  },
  required: ['name', 'units'],
} as const;

/** Root write fields shared by the create and update tools. */
const RECURRING_WRITE_PROPERTIES = {
  contactId: { type: 'string', description: 'Contact ObjectId the recurrence invoices' },
  contactName: { type: 'string', description: 'Contact name (optional; derived from the id)' },
  periodicity: {
    type: 'string',
    enum: ['d', 'w', 'bw', 'm', 'bm', 'q', 'ba', 'a'],
    description:
      'Recurrence interval: d daily, w weekly, bw biweekly, m monthly, bm bimonthly, q quarterly, ba biannual, a annual',
  },
  convertAutomatically: {
    type: 'boolean',
    description:
      'When true Holded turns each occurrence into a real invoice on its own. Defaults to false, which leaves a draft for review.',
  },
  dueDays: {
    type: 'number',
    description: 'Days from the issue date to the due date (vencimiento)',
  },
  contactPaymentDay: { type: 'number', description: 'Day of the month the contact pays on' },
  endDate: {
    type: 'string',
    description: 'Last date of the recurrence, inclusive. ISO YYYY-MM-DD.',
  },
  date: { type: 'string', description: 'Issue date of the first occurrence. ISO YYYY-MM-DD.' },
  description: {
    type: 'string',
    description: 'Document description — the concept Holded shows in the list',
  },
  notes: { type: 'string', description: 'Internal notes, visible only to your team' },
  documentBody: { type: 'string', description: 'Rich content printed on the document body' },
  language: { type: 'string', description: 'ISO 639-1 language code, e.g. es, ca, en' },
  currency: { type: 'string', description: 'ISO 4217 currency code, e.g. EUR' },
  currencyChange: { type: 'number', description: 'FX rate when not in the base currency' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Document-level tags' },
  numberLineId: { type: 'string', description: 'Numbering series ObjectId' },
  discount: { type: 'number', description: 'Global discount percentage (0–100)' },
  designId: { type: 'string', description: 'Document design template ObjectId' },
  expAccountId: {
    type: 'string',
    description: 'Account ObjectId cascaded to every line that does not set its own `account`',
  },
  items: {
    type: 'array',
    description: 'Recurrence lines',
    items: RECURRING_ITEM_SCHEMA,
  },
} as const;

export function getRecurringInvoiceTools(client: HoldedClient) {
  return {
    // List Recurring Invoices
    list_recurring_invoices: {
      description:
        'List recurring sales invoices (facturas recurrentes) via Holded API v2 GET /recurring-invoices. Each item carries its `periodicity` code, `convert_automatically`, `end_date`, `next_invoice_scheduled_at` and the full line list, so this is how you read the monthly billing template instead of guessing it from last month invoice. Cursor-paginated. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          contactId: {
            type: 'string',
            description: 'Only recurrences for this contact ObjectId',
          },
          limit: { type: 'number', description: 'Max items per page (default 50, max 200)' },
          cursor: { type: 'string', description: 'Cursor from a previous response nextCursor' },
          summary: {
            type: 'boolean',
            description: 'Return only count and pagination metadata without items (default: false)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Project only these fields per item (e.g. ["id", "contact_name", "description", "periodicity"]). Reduces response size.',
          },
        },
      },
      readOnlyHint: true,
      handler: withValidation(listRecurringInvoicesSchema, async (args) => {
        const params: Record<string, string | number> = cursorParams(args);
        if (args.contactId) params.contact_id = args.contactId;
        const result = normalizeV2List(await client.get(BASE, params));

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

    // Get Recurring Invoice
    get_recurring_invoice: {
      description:
        'Get one recurring invoice by id (Holded API v2). Returns the template: contact, description, custom fields, periodicity, next scheduled date and every line with its taxes and accounting account. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          recurringInvoiceId: { type: 'string', description: 'Recurring invoice ObjectId' },
        },
        required: ['recurringInvoiceId'],
      },
      readOnlyHint: true,
      handler: withValidation(recurringInvoiceIdSchema, async (args) => {
        return client.get(`${BASE}/${args.recurringInvoiceId}`, undefined);
      }),
    },

    // Get Recurring Invoice Schedule
    get_recurring_invoice_schedule: {
      description:
        'Get the occurrence schedule of a recurring invoice (Holded API v2 GET /recurring-invoices/{id}/schedule): past converted occurrences, skipped ones and future pending dates. Use it to check whether the current month has already been issued before creating anything. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          recurringInvoiceId: { type: 'string', description: 'Recurring invoice ObjectId' },
          until: {
            type: 'string',
            description: 'Upper date boundary, ISO YYYY-MM-DD. Defaults to one year from today.',
          },
        },
        required: ['recurringInvoiceId'],
      },
      readOnlyHint: true,
      handler: withValidation(recurringScheduleSchema, async (args) => {
        const params = args.until ? { until: args.until } : undefined;
        return client.get(`${BASE}/${args.recurringInvoiceId}/schedule`, params);
      }),
    },

    // Create Recurring Invoice
    create_recurring_invoice: {
      description:
        'Create a recurring sales invoice (Holded API v2 POST /recurring-invoices). `contactId`, `periodicity` and `items` are required. Line `price` is the UNIT price and a line takes SEVERAL taxes, so VAT and IRPF retention go together as taxes:["s_iva_21","s_ret_19"]. The vencimiento is `dueDays` here (days from issue), NOT an absolute date. Note the documented body has NO custom_fields: a PROYECTO: value has to be set in Holded, or on each invoice the recurrence produces. Leave `convertAutomatically` false to keep a draft for review before issuing.',
      inputSchema: {
        type: 'object' as const,
        properties: RECURRING_WRITE_PROPERTIES,
        required: ['contactId', 'periodicity', 'items'],
      },
      destructiveHint: true,
      handler: withValidation(createRecurringInvoiceSchema, async (args) => {
        return client.post(BASE, toV2RecurringBody(args as Record<string, unknown>));
      }),
    },

    // Update Recurring Invoice
    update_recurring_invoice: {
      description:
        'Update a recurring sales invoice (Holded API v2 PUT /recurring-invoices/{id}). Same fields as create_recurring_invoice. Sending `items` REPLACES every line, so pass the full list you want to keep — this is how you drop a line that is no longer billed. Changes affect future occurrences only; invoices already issued are untouched.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          recurringInvoiceId: {
            type: 'string',
            description: 'Recurring invoice ObjectId to update',
          },
          ...RECURRING_WRITE_PROPERTIES,
        },
        required: ['recurringInvoiceId'],
      },
      destructiveHint: true,
      handler: withValidation(updateRecurringInvoiceSchema, async (args) => {
        const { recurringInvoiceId, ...rest } = args;
        return client.put(
          `${BASE}/${recurringInvoiceId}`,
          toV2RecurringBody(rest as Record<string, unknown>)
        );
      }),
    },

    // Skip one occurrence
    skip_recurring_invoice_occurrence: {
      description:
        'Skip one occurrence of a recurring invoice (Holded API v2 POST /recurring-invoices/{id}/skip), so that period is not invoiced. The route is documented but its request body is NOT: `date` is sent only when provided, and Holded may ignore it and skip the next pending occurrence instead. Check the result with get_recurring_invoice_schedule before relying on it.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          recurringInvoiceId: { type: 'string', description: 'Recurring invoice ObjectId' },
          date: {
            type: 'string',
            description:
              'Occurrence to skip, ISO YYYY-MM-DD. Unverified against the live API; omit to skip the next pending occurrence.',
          },
        },
        required: ['recurringInvoiceId'],
      },
      destructiveHint: true,
      handler: withValidation(skipRecurringOccurrenceSchema, async (args) => {
        const body = args.date ? { date: args.date } : {};
        return client.post(`${BASE}/${args.recurringInvoiceId}/skip`, body);
      }),
    },

    // Delete Recurring Invoice
    delete_recurring_invoice: {
      description:
        'Delete a recurring invoice (Holded API v2 DELETE /recurring-invoices/{id}). This removes the template and every future occurrence; invoices already issued from it are NOT deleted. To stop a recurrence but keep its history, prefer update_recurring_invoice with an `endDate`.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          recurringInvoiceId: {
            type: 'string',
            description: 'Recurring invoice ObjectId to delete',
          },
        },
        required: ['recurringInvoiceId'],
      },
      destructiveHint: true,
      handler: withValidation(recurringInvoiceIdSchema, async (args) => {
        return client.delete(`${BASE}/${args.recurringInvoiceId}`);
      }),
    },
  };
}
