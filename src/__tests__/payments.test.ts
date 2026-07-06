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
      expect(client.get).toHaveBeenCalledWith('/payments', {}, 'v2');
    });

    it('should pass cursor to API', async () => {
      await tools.list_payments.handler({ cursor: 'page:2' });
      expect(client.get).toHaveBeenCalledWith('/payments', { cursor: 'page:2' }, 'v2');
    });

    it('should pass limit to API', async () => {
      await tools.list_payments.handler({ limit: 10 });
      expect(client.get).toHaveBeenCalledWith('/payments', { limit: 10 }, 'v2');
    });

    it('should forward starttmp and endtmp as query params', async () => {
      await tools.list_payments.handler({ starttmp: '1700000000', endtmp: '1701000000' });
      expect(client.get).toHaveBeenCalledWith(
        '/payments',
        { starttmp: '1700000000', endtmp: '1701000000' },
        'v2'
      );
    });

    it('should auto-set endtmp when only starttmp is provided', async () => {
      await tools.list_payments.handler({ starttmp: '1700000000' });
      const callArgs = (client.get as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toBe('/payments');
      expect(callArgs[2]).toBe('v2');
      expect((callArgs[1] as Record<string, unknown>).starttmp).toBe('1700000000');
      expect(typeof (callArgs[1] as Record<string, unknown>).endtmp).toBe('string');
    });

    it('should normalize v2 envelope and return items', async () => {
      const mockItems = [{ id: 'p1', name: 'Bank Transfer' }];
      client.get = vi.fn().mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_payments.handler({})) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
    });
  });

  describe('create_payment', () => {
    it('should create a payment method via v2', async () => {
      await tools.create_payment.handler({ name: 'Bank Transfer' });
      expect(client.post).toHaveBeenCalledWith('/payments', { name: 'Bank Transfer' }, 'v2');
    });

    it('should include days if provided', async () => {
      const args = { name: 'Net 30', days: 30 };
      await tools.create_payment.handler(args);
      expect(client.post).toHaveBeenCalledWith('/payments', args, 'v2');
    });
  });

  describe('get_payment', () => {
    it('should get a payment by ID via v2', async () => {
      await tools.get_payment.handler({ paymentId: 'payment-123' });
      expect(client.get).toHaveBeenCalledWith('/payments/payment-123', undefined, 'v2');
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
      }, 'v2');
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
      expect(client.get).toHaveBeenCalledWith('/payments/payment-123', undefined, 'v2');
      // name/contactId/bankId preserved from the current record; days updated; id dropped.
      expect(client.put).toHaveBeenCalledWith('/payments/payment-123', {
        name: 'Bank Transfer',
        days: 60,
        contactId: 'contact-1',
        bankId: 'bank-1',
      }, 'v2');
    });
  });

  describe('delete_payment', () => {
    it('should delete a payment via v2', async () => {
      await tools.delete_payment.handler({ paymentId: 'payment-123' });
      expect(client.delete).toHaveBeenCalledWith('/payments/payment-123', 'v2');
    });
  });
});
