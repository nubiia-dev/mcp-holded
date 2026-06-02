import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getAccountingTools } from '../tools/accounting.js';

describe('Accounting Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getAccountingTools>;

  const start = Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000);
  const end = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getAccountingTools(client);
  });

  describe('get_chart_of_accounts', () => {
    it('targets the accounting API base', async () => {
      await tools.get_chart_of_accounts.handler();
      expect(client.get).toHaveBeenCalledWith('/chartofaccounts', undefined, 'accounting');
    });
  });

  describe('get_daily_ledger', () => {
    it('requests the ledger on the accounting API with the timestamp range', async () => {
      await tools.get_daily_ledger.handler({ starttmp: start, endtmp: end });
      expect(client.get).toHaveBeenCalledWith(
        '/dailyledger',
        { starttmp: start, endtmp: end },
        'accounting'
      );
    });

    it('rejects a range longer than one year', async () => {
      const tooLong = start + 400 * 24 * 60 * 60;
      await expect(
        tools.get_daily_ledger.handler({ starttmp: start, endtmp: tooLong })
      ).rejects.toThrow(/1 year/);
    });

    it('rejects an inverted range', async () => {
      await expect(
        tools.get_daily_ledger.handler({ starttmp: end, endtmp: start })
      ).rejects.toThrow(/greater than or equal/);
    });

    it('groups lines by entryNumber when requested', async () => {
      vi.mocked(client.get).mockResolvedValueOnce([
        { entryNumber: 61, line: 1, type: 'payment', account: 40000018, debit: 11.92, credit: 0 },
        { entryNumber: 61, line: 2, type: 'payment', account: 57200000, debit: 0, credit: 11.92 },
        { entryNumber: 62, line: 1, type: 'purchase', account: 60000000, debit: 50, credit: 0 },
      ]);
      const result = (await tools.get_daily_ledger.handler({
        starttmp: start,
        endtmp: end,
        groupByEntry: true,
      })) as Array<{
        entryNumber: number;
        lines: unknown[];
        totalDebit: number;
        totalCredit: number;
      }>;
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ entryNumber: 61, totalDebit: 11.92, totalCredit: 11.92 });
      expect(result[0].lines).toHaveLength(2);
      expect(result[1]).toMatchObject({ entryNumber: 62, totalDebit: 50, totalCredit: 0 });
    });
  });
});
