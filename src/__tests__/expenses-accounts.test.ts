import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getExpensesAccountTools } from '../tools/expenses-accounts.js';

describe('Expenses Account Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getExpensesAccountTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getExpensesAccountTools(client);
  });

  // Realistic /expenses-accounts shape: the PGC number lives in `accountNum`
  // (not `code`), alongside the Holded internal `id`.
  const sampleAccounts = [
    { id: 'acct-1', name: 'Office Supplies', accountNum: 62900000 },
    { id: 'acct-2', name: 'Travel', accountNum: 62900001 },
  ];

  describe('list_expenses_accounts', () => {
    it('should list all expenses accounts via v2 route', async () => {
      await tools.list_expenses_accounts.handler({});
    });

    it('should pass limit to API', async () => {
      await tools.list_expenses_accounts.handler({ limit: 20 });
    });

    it('should pass cursor to API', async () => {
      await tools.list_expenses_accounts.handler({ cursor: 'page:2' });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: sampleAccounts, cursor: 'page:2', has_more: true });
      const result = (await tools.list_expenses_accounts.handler({})) as any;
      expect(result.items).toEqual(sampleAccounts);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('surfaces id and accountNum in default fields', async () => {
      client.get = vi.fn().mockResolvedValue({ items: sampleAccounts });

      const result = (await tools.list_expenses_accounts.handler({})) as {
        items: Array<Record<string, unknown>>;
      };

      expect(result.items[0]).toEqual({
        id: 'acct-1',
        name: 'Office Supplies',
        accountNum: 62900000,
      });
      expect(result.items[0].id).toBe('acct-1');
      expect(result.items[0].accountNum).toBe(62900000);
    });

    it('returns only the requested fields when `fields` is provided', async () => {
      client.get = vi.fn().mockResolvedValue({ items: sampleAccounts });

      const result = (await tools.list_expenses_accounts.handler({
        fields: ['id', 'accountNum'],
      })) as { items: Array<Record<string, unknown>> };

      expect(result.items[0]).toEqual({ id: 'acct-1', accountNum: 62900000 });
      expect(result.items[0]).not.toHaveProperty('name');
    });

    it('returns only counts in summary mode', async () => {
      client.get = vi.fn().mockResolvedValue({ items: sampleAccounts });

      const result = (await tools.list_expenses_accounts.handler({ summary: true })) as {
        count: number;
        nextCursor?: string;
        hasMore?: boolean;
      };

      expect(result.count).toBe(2);
    });

    it('returns nextCursor and hasMore in summary mode when present', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: sampleAccounts, cursor: 'page:2', has_more: true });
      const result = (await tools.list_expenses_accounts.handler({ summary: true })) as any;
      expect(result.count).toBe(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('create_expenses_account', () => {
    it('should create an expenses account via v2 route', async () => {
      await tools.create_expenses_account.handler({ name: 'Office Supplies' });
    });

    it('should include code if provided', async () => {
      const args = { name: 'Travel', code: '6290' };
      await tools.create_expenses_account.handler(args);
    });
  });

  describe('get_expenses_account', () => {
    it('should get an expenses account by ID via v2 route', async () => {
      await tools.get_expenses_account.handler({ accountId: 'account-123' });
    });
  });

  describe('update_expenses_account', () => {
    it('should update an expenses account via v2 route', async () => {
      const args = {
        accountId: 'account-123',
        name: 'Updated Name',
        code: '6300',
      };
      await tools.update_expenses_account.handler(args);
      expect(client.put).toHaveBeenCalledWith('/expenses-accounts/account-123', {
        name: 'Updated Name',
        code: '6300',
      });
    });

    describe('delete_expenses_account', () => {
      it('should delete an expenses account via v2 route', async () => {
        await tools.delete_expenses_account.handler({ accountId: 'account-123' });
      });
    });
  });
});
