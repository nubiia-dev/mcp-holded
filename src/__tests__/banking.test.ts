import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getBankingTools } from '../tools/banking.js';

describe('Banking Tools (EXPERIMENTAL — internal API)', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getBankingTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getBankingTools(client);
  });

  describe('reconcile_bank_transaction', () => {
    it('posts to the internal reconcile endpoint on the `internal` API base', async () => {
      client.post = vi.fn().mockResolvedValue({ status: 1 });
      await tools.reconcile_bank_transaction.handler({
        accountId: 'acc-1',
        transactionId: 'txn-1',
        entryId: 'entry-1',
      });
      expect(client.post).toHaveBeenCalledWith(
        '/internal/banking/accounts/acc-1/transactions/txn-1/reconcile',
        { entryId: 'entry-1' },
        'internal'
      );
    });

    it('always returns an experimental/unverified warning', async () => {
      client.post = vi.fn().mockResolvedValue({ status: 1 });
      const result = (await tools.reconcile_bank_transaction.handler({
        accountId: 'acc-1',
        transactionId: 'txn-1',
      })) as any;
      expect(result._warnings).toBeDefined();
      expect(result._warnings[0]).toMatch(/undocumented|unverified/i);
    });

    it('rejects when required identifiers are missing', async () => {
      await expect(
        tools.reconcile_bank_transaction.handler({ accountId: '', transactionId: 'txn-1' } as any)
      ).rejects.toThrow();
    });
  });
});
