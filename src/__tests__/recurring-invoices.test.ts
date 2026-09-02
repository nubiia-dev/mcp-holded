import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getRecurringInvoiceTools, toV2RecurringItem } from '../tools/recurring-invoices.js';
import { createRecurringInvoiceSchema, recurringItemSchema } from '../validation.js';

describe('Recurring Invoice Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getRecurringInvoiceTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getRecurringInvoiceTools(client);
  });

  describe('list_recurring_invoices', () => {
    it('lists via the v2 route', async () => {
      await tools.list_recurring_invoices.handler({});
      expect(client.get).toHaveBeenCalledWith('/recurring-invoices', {});
    });

    it('filters by contact as contact_id', async () => {
      await tools.list_recurring_invoices.handler({ contactId: 'c-1', limit: 10 });
      expect(client.get).toHaveBeenCalledWith('/recurring-invoices', {
        limit: 10,
        contact_id: 'c-1',
      });
    });

    it('projects only the requested fields', async () => {
      (client.get as any).mockResolvedValue({
        items: [{ id: 'r-1', description: 'Alquiler', periodicity: 'm', contact_name: 'X' }],
      });
      const result: any = await tools.list_recurring_invoices.handler({
        fields: ['id', 'periodicity'],
      });
      expect(result.items[0]).toEqual({ id: 'r-1', periodicity: 'm' });
    });
  });

  describe('get_recurring_invoice / schedule', () => {
    it('gets one recurrence by id', async () => {
      await tools.get_recurring_invoice.handler({ recurringInvoiceId: 'r-1' });
      expect(client.get).toHaveBeenCalledWith('/recurring-invoices/r-1', undefined);
    });

    it('gets the schedule, passing `until` when given', async () => {
      await tools.get_recurring_invoice_schedule.handler({
        recurringInvoiceId: 'r-1',
        until: '2026-12-31',
      });
      expect(client.get).toHaveBeenCalledWith('/recurring-invoices/r-1/schedule', {
        until: '2026-12-31',
      });
    });

    it('rejects a malformed `until`', async () => {
      await expect(
        tools.get_recurring_invoice_schedule.handler({
          recurringInvoiceId: 'r-1',
          until: '31/12/2026',
        })
      ).rejects.toThrow();
    });
  });

  describe('create_recurring_invoice', () => {
    it('maps the body to v2 snake_case, unit price and several taxes per line', async () => {
      await tools.create_recurring_invoice.handler({
        contactId: 'aaaaaaaaaaaaaaaaaaaaaaa1',
        periodicity: 'm',
        dueDays: 30,
        description: 'Alquiler Oficina',
        notes: 'Alquiler Oficina',
        numberLineId: 'serie-1',
        designId: 'design-1',
        items: [
          {
            name: 'Alquiler',
            units: 2,
            price: 258,
            taxes: ['s_iva_21', 's_ret_19'],
            account: 'bbbbbbbbbbbbbbbbbbbbbbb2',
          },
        ],
      });
      const [path, body] = (client.post as any).mock.calls[0];
      expect(path).toBe('/recurring-invoices');
      expect(body.contact_id).toBe('aaaaaaaaaaaaaaaaaaaaaaa1');
      expect(body.periodicity).toBe('m');
      expect(body.due_days).toBe(30);
      expect(body.number_line_id).toBe('serie-1');
      expect(body.design_id).toBe('design-1');
      expect(body.items[0]).toEqual({
        name: 'Alquiler',
        units: 2,
        price: 258,
        taxes: ['s_iva_21', 's_ret_19'],
        account: 'bbbbbbbbbbbbbbbbbbbbbbb2',
      });
      expect(body).not.toHaveProperty('dueDays');
      expect(body).not.toHaveProperty('expAccountId');
    });

    it('cascades expAccountId to lines without their own account', async () => {
      await tools.create_recurring_invoice.handler({
        contactId: 'c-1',
        periodicity: 'm',
        expAccountId: 'acct-cascade',
        items: [
          { name: 'A', units: 1, price: 10 },
          { name: 'B', units: 1, price: 20, account: 'acct-own' },
        ],
      });
      const body = (client.post as any).mock.calls[0][1];
      expect(body.items[0].account).toBe('acct-cascade');
      expect(body.items[1].account).toBe('acct-own');
    });

    it('rejects an unknown periodicity', async () => {
      await expect(
        tools.create_recurring_invoice.handler({
          contactId: 'c-1',
          periodicity: 'monthly',
          items: [{ name: 'A', units: 1, price: 10 }],
        })
      ).rejects.toThrow();
    });

    it('rejects an empty line list', async () => {
      await expect(
        tools.create_recurring_invoice.handler({
          contactId: 'c-1',
          periodicity: 'm',
          items: [],
        })
      ).rejects.toThrow();
    });

    it('rejects a line field the recurring endpoint does not accept', async () => {
      const result = recurringItemSchema.safeParse({
        name: 'A',
        units: 1,
        price: 10,
        retention: 19,
      });
      expect(result.success).toBe(false);
    });

    it('rejects a numeric account with a message naming the ObjectId', async () => {
      await expect(
        tools.create_recurring_invoice.handler({
          contactId: 'c-1',
          periodicity: 'm',
          items: [{ name: 'A', units: 1, price: 10, account: 70500000 }],
        })
      ).rejects.toThrow(/ObjectId/);
    });

    it('requires a unit price on a non-title line', () => {
      expect(recurringItemSchema.safeParse({ name: 'A', units: 1 }).success).toBe(false);
      expect(recurringItemSchema.safeParse({ name: 'A', units: 0, type: 'title' }).success).toBe(
        true
      );
    });

    it('accepts `subtotal` as the legacy alias for the unit price', () => {
      expect(toV2RecurringItem({ name: 'A', units: 2, subtotal: 258 }).price).toBe(258);
    });

    it('requires contactId, periodicity and items', () => {
      expect(createRecurringInvoiceSchema.safeParse({ periodicity: 'm', items: [] }).success).toBe(
        false
      );
    });
  });

  describe('update_recurring_invoice', () => {
    it('puts to the recurrence route without leaking the id into the body', async () => {
      await tools.update_recurring_invoice.handler({
        recurringInvoiceId: 'r-1',
        items: [{ name: 'Servicios Administrativos', units: 1, price: 1283, taxes: ['s_iva_21'] }],
      });
      const [path, body] = (client.put as any).mock.calls[0];
      expect(path).toBe('/recurring-invoices/r-1');
      expect(body.items).toHaveLength(1);
      expect(body).not.toHaveProperty('recurringInvoiceId');
    });

    it('accepts an endDate to stop a recurrence', async () => {
      await tools.update_recurring_invoice.handler({
        recurringInvoiceId: 'r-1',
        endDate: '2026-07-31',
      });
      expect((client.put as any).mock.calls[0][1]).toEqual({ end_date: '2026-07-31' });
    });
  });

  describe('skip / delete', () => {
    it('skips the next occurrence with an empty body', async () => {
      await tools.skip_recurring_invoice_occurrence.handler({ recurringInvoiceId: 'r-1' });
      expect(client.post).toHaveBeenCalledWith('/recurring-invoices/r-1/skip', {});
    });

    it('sends the date when one is given', async () => {
      await tools.skip_recurring_invoice_occurrence.handler({
        recurringInvoiceId: 'r-1',
        date: '2026-09-30',
      });
      expect(client.post).toHaveBeenCalledWith('/recurring-invoices/r-1/skip', {
        date: '2026-09-30',
      });
    });

    it('deletes by id', async () => {
      await tools.delete_recurring_invoice.handler({ recurringInvoiceId: 'r-1' });
      expect(client.delete).toHaveBeenCalledWith('/recurring-invoices/r-1');
    });
  });

  describe('tool metadata', () => {
    it('marks reads read-only and writes destructive', () => {
      expect(tools.list_recurring_invoices.readOnlyHint).toBe(true);
      expect(tools.get_recurring_invoice.readOnlyHint).toBe(true);
      expect(tools.get_recurring_invoice_schedule.readOnlyHint).toBe(true);
      expect(tools.create_recurring_invoice.destructiveHint).toBe(true);
      expect(tools.update_recurring_invoice.destructiveHint).toBe(true);
      expect(tools.delete_recurring_invoice.destructiveHint).toBe(true);
      expect(tools.skip_recurring_invoice_occurrence.destructiveHint).toBe(true);
    });
  });
});
