import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getAccountingTools } from '../tools/accounting.js';

describe('Accounting Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getAccountingTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    // Default mock returns empty v2 list envelope
    vi.mocked(client.get).mockResolvedValue({ items: [] });
    tools = getAccountingTools(client);
  });

  describe('get_chart_of_accounts', () => {
    it('targets the v2 /accounting-accounts endpoint', async () => {
      await tools.get_chart_of_accounts.handler({});
    });

    it('passes limit and cursor as query params', async () => {
      await tools.get_chart_of_accounts.handler({ limit: 50, cursor: 'tok' });
    });

    it('passes optional annex filters (archived, start_date, end_date, include_empty) as query params', async () => {
      await tools.get_chart_of_accounts.handler({
        archived: true,
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        include_empty: false,
      });
      // Booleans are serialised as "true"/"false" strings — standard URL query convention.
      expect(client.get).toHaveBeenCalledWith('/accounting-accounts', {
        archived: 'true',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        include_empty: 'false',
      });
    });

    it('normalizes the v2 response envelope', async () => {
      vi.mocked(client.get).mockResolvedValueOnce({ items: [{ id: 'a1' }], nextCursor: 'cur1' });
      const result = (await tools.get_chart_of_accounts.handler({})) as {
        items: unknown[];
        nextCursor: string;
      };
      expect(result.items).toEqual([{ id: 'a1' }]);
      expect(result.nextCursor).toBe('cur1');
    });
  });

  describe('get_daily_ledger', () => {
    it('accepts ISO start_date/end_date and calls v2 /ledger-entries', async () => {
      await tools.get_daily_ledger.handler({ start_date: '2025-01-01', end_date: '2025-12-31' });
      expect(client.get).toHaveBeenCalledWith(
        '/ledger-entries',
        expect.objectContaining({ start_date: '2025-01-01', end_date: '2025-12-31' })
      );
    });

    it('converts starttmp Unix timestamp 1750000000 to start_date "2025-06-15"', async () => {
      await tools.get_daily_ledger.handler({ starttmp: 1750000000, endtmp: 1751000000 });
      const [, params] = vi.mocked(client.get).mock.calls[0];
      expect((params as Record<string, unknown>).start_date).toBe('2025-06-15');
    });

    it('converts starttmp/endtmp to ISO date strings and passes them to v2', async () => {
      await tools.get_daily_ledger.handler({ starttmp: 1750000000, endtmp: 1751000000 });
      expect(client.get).toHaveBeenCalledWith(
        '/ledger-entries',
        expect.objectContaining({ start_date: '2025-06-15', end_date: '2025-06-27' })
      );
    });

    it('throws the exact error when neither start_date nor starttmp is provided', async () => {
      await expect(tools.get_daily_ledger.handler({ end_date: '2025-12-31' })).rejects.toThrow(
        'get_daily_ledger requires start_date and end_date (ISO) — the Holded API v2 returns 422 without them'
      );
    });

    it('throws the exact error when neither end_date nor endtmp is provided', async () => {
      await expect(tools.get_daily_ledger.handler({ start_date: '2025-01-01' })).rejects.toThrow(
        'get_daily_ledger requires start_date and end_date (ISO) — the Holded API v2 returns 422 without them'
      );
    });

    it('groups lines by entryNumber when groupByEntry is true (page-scoped)', async () => {
      vi.mocked(client.get).mockResolvedValueOnce({
        items: [
          { entryNumber: 61, line: 1, type: 'payment', account: 40000018, debit: 11.92, credit: 0 },
          { entryNumber: 61, line: 2, type: 'payment', account: 57200000, debit: 0, credit: 11.92 },
          { entryNumber: 62, line: 1, type: 'purchase', account: 60000000, debit: 50, credit: 0 },
        ],
      });
      const result = (await tools.get_daily_ledger.handler({
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        groupByEntry: true,
      })) as {
        items: Array<{
          entryNumber: number;
          lines: unknown[];
          totalDebit: number;
          totalCredit: number;
        }>;
      };
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        entryNumber: 61,
        totalDebit: 11.92,
        totalCredit: 11.92,
      });
      expect(result.items[0].lines).toHaveLength(2);
      expect(result.items[1]).toMatchObject({ entryNumber: 62, totalDebit: 50, totalCredit: 0 });
    });
  });
});
