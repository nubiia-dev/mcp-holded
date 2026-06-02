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

  // Realistic /expensesaccounts shape: the PGC number lives in `accountNum`
  // (not `code`), alongside the Holded internal `id`.
  const sampleAccounts = [
    { id: 'acct-1', name: 'Office Supplies', accountNum: 62900000 },
    { id: 'acct-2', name: 'Travel', accountNum: 62900001 },
  ];

  describe('list_expenses_accounts', () => {
    it('should list all expenses accounts', async () => {
      await tools.list_expenses_accounts.handler({});
      expect(client.get).toHaveBeenCalledWith('/expensesaccounts');
    });

    it('surfaces id and accountNum in default fields', async () => {
      (client.get as any).mockResolvedValue(sampleAccounts);

      const result = (await tools.list_expenses_accounts.handler({})) as {
        items: Array<Record<string, unknown>>;
      };

      // Regression: the id and the PGC `accountNum` used to be dropped.
      expect(result.items[0]).toEqual({
        id: 'acct-1',
        name: 'Office Supplies',
        accountNum: 62900000,
      });
      expect(result.items[0].id).toBe('acct-1');
      expect(result.items[0].accountNum).toBe(62900000);
    });

    it('returns only the requested fields when `fields` is provided', async () => {
      (client.get as any).mockResolvedValue(sampleAccounts);

      const result = (await tools.list_expenses_accounts.handler({
        fields: ['id', 'accountNum'],
      })) as { items: Array<Record<string, unknown>> };

      expect(result.items[0]).toEqual({ id: 'acct-1', accountNum: 62900000 });
      expect(result.items[0]).not.toHaveProperty('name');
    });

    it('returns only counts in summary mode', async () => {
      (client.get as any).mockResolvedValue(sampleAccounts);

      const result = (await tools.list_expenses_accounts.handler({ summary: true })) as {
        total: number;
        totalPages: number;
      };

      expect(result).toEqual({ total: 2, totalPages: 1 });
    });

    it('paginates results', async () => {
      (client.get as any).mockResolvedValue(sampleAccounts);

      const result = (await tools.list_expenses_accounts.handler({ page: 2, pageSize: 1 })) as {
        items: Array<Record<string, unknown>>;
        page: number;
        total: number;
      };

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('acct-2');
      expect(result.page).toBe(2);
      expect(result.total).toBe(2);
    });
  });

  describe('create_expenses_account', () => {
    it('should create an expenses account', async () => {
      await tools.create_expenses_account.handler({ name: 'Office Supplies' });
      expect(client.post).toHaveBeenCalledWith('/expensesaccounts', { name: 'Office Supplies' });
    });

    it('should include code if provided', async () => {
      const args = { name: 'Travel', code: '6290' };
      await tools.create_expenses_account.handler(args);
      expect(client.post).toHaveBeenCalledWith('/expensesaccounts', args);
    });
  });

  describe('get_expenses_account', () => {
    it('should get an expenses account by ID', async () => {
      await tools.get_expenses_account.handler({ accountId: 'account-123' });
      expect(client.get).toHaveBeenCalledWith('/expensesaccounts/account-123');
    });
  });

  describe('update_expenses_account', () => {
    it('should update an expenses account', async () => {
      const args = {
        accountId: 'account-123',
        name: 'Updated Name',
        code: '6300',
      };
      await tools.update_expenses_account.handler(args);
      expect(client.put).toHaveBeenCalledWith('/expensesaccounts/account-123', {
        name: 'Updated Name',
        code: '6300',
      });
    });
  });

  describe('delete_expenses_account', () => {
    it('should delete an expenses account', async () => {
      await tools.delete_expenses_account.handler({ accountId: 'account-123' });
      expect(client.delete).toHaveBeenCalledWith('/expensesaccounts/account-123');
    });
  });
});
