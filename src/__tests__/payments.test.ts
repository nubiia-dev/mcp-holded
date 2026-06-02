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
    it('should list all payments', async () => {
      await tools.list_payments.handler({});
      expect(client.get).toHaveBeenCalledWith('/payments', {});
    });

    it('should support pagination', async () => {
      await tools.list_payments.handler({ page: 2 });
      expect(client.get).toHaveBeenCalledWith('/payments', { page: 2 });
    });
  });

  describe('create_payment', () => {
    it('should create a payment method', async () => {
      await tools.create_payment.handler({ name: 'Bank Transfer' });
      expect(client.post).toHaveBeenCalledWith('/payments', { name: 'Bank Transfer' });
    });

    it('should include days if provided', async () => {
      const args = { name: 'Net 30', days: 30 };
      await tools.create_payment.handler(args);
      expect(client.post).toHaveBeenCalledWith('/payments', args);
    });
  });

  describe('get_payment', () => {
    it('should get a payment by ID', async () => {
      await tools.get_payment.handler({ paymentId: 'payment-123' });
      expect(client.get).toHaveBeenCalledWith('/payments/payment-123');
    });
  });

  describe('update_payment', () => {
    it('should update a payment', async () => {
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

    it('#9 merges changes over the current payment so omitted fields are not blanked', async () => {
      client.get = vi.fn().mockResolvedValue({
        id: 'payment-123',
        name: 'Bank Transfer',
        days: 30,
        contactId: 'contact-1',
        bankId: 'bank-1',
      });
      await tools.update_payment.handler({ paymentId: 'payment-123', days: 60 });
      expect(client.get).toHaveBeenCalledWith('/payments/payment-123');
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
    it('should delete a payment', async () => {
      await tools.delete_payment.handler({ paymentId: 'payment-123' });
      expect(client.delete).toHaveBeenCalledWith('/payments/payment-123');
    });
  });
});
