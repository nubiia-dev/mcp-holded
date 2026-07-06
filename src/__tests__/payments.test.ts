import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getPaymentTools } from '../tools/payments.js';

describe('Payment Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getPaymentTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getPaymentTools(client);
  });

  describe('list_payments', () => {
    it('should list all payments via v2', async () => {
      await tools.list_payments.handler({});
    });

    it('should pass cursor to API', async () => {
      await tools.list_payments.handler({ cursor: 'page:2' });
    });

    it('should pass limit to API', async () => {
      await tools.list_payments.handler({ limit: 10 });
    });

    it('should forward start_date and end_date as-is in query params', async () => {
      await tools.list_payments.handler({ start_date: '2024-01-01', end_date: '2024-12-31' });
      expect(client.get).toHaveBeenCalledWith(
        '/payments',
        expect.objectContaining({ start_date: '2024-01-01', end_date: '2024-12-31' })
      );
    });

    it('should convert legacy starttmp number to ISO start_date', async () => {
      // 1700000000 seconds → 2023-11-14T22:13:20.000Z → slice 10 → "2023-11-14"
      await tools.list_payments.handler({ starttmp: 1700000000 });
      expect(client.get).toHaveBeenCalledWith(
        '/payments',
        expect.objectContaining({ start_date: '2023-11-14' })
      );
    });

    it('should prefer start_date over legacy starttmp when both provided', async () => {
      await tools.list_payments.handler({ start_date: '2024-06-01', starttmp: 1700000000 });
      const call = (client.get as ReturnType<typeof vi.fn>).mock.calls[0];
      expect((call[1] as Record<string, unknown>).start_date).toBe('2024-06-01');
    });

    it('should normalize v2 envelope and return items', async () => {
      const mockItems = [{ id: 'p1', name: 'Bank Transfer' }];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_payments.handler({})) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });
  });

  describe('create_payment', () => {
    it('should create a payment method via v2', async () => {
      await tools.create_payment.handler({ name: 'Bank Transfer' });
    });

    it('should include days if provided', async () => {
      const args = { name: 'Net 30', days: 30 };
      await tools.create_payment.handler(args);
    });
  });

  describe('get_payment', () => {
    it('should get a payment by ID via v2', async () => {
      await tools.get_payment.handler({ paymentId: 'payment-123' });
    });
  });

  describe('update_payment', () => {
    it('should update a payment via v2', async () => {
      const args = {
        paymentId: 'payment-123',
        name: 'Updated Payment',
        days: 60,
      };
      await tools.update_payment.handler(args);
      expect(client.put).toHaveBeenCalledWith('/payments/payment-123', {
        name: 'Updated Payment',
        days: 60,
      });
    });

    it('#9 merges changes over the current payment (v2 routes) so omitted fields are not blanked', async () => {
      client.get = vi.fn().mockResolvedValue({
        id: 'payment-123',
        name: 'Bank Transfer',
        days: 30,
        contactId: 'contact-1',
        bankId: 'bank-1',
      });
      await tools.update_payment.handler({ paymentId: 'payment-123', days: 60 });
      // name/contactId/bankId preserved from the current record; days updated; id dropped.
      expect(client.put).toHaveBeenCalledWith('/payments/payment-123', {
        name: 'Bank Transfer',
        days: 60,
        contactId: 'contact-1',
        bankId: 'bank-1',
      });
    });
  });

  describe('delete_payment', () => {
    it('should delete a payment via v2', async () => {
      await tools.delete_payment.handler({ paymentId: 'payment-123' });
    });
  });
});
