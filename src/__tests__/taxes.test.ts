import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTaxTools } from '../tools/taxes.js';

describe('Tax Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTaxTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTaxTools(client);
  });

  // A realistic shape for Holded's /taxes payload. The identifier lives in
  // `key` (mirrored by `id`) and the rate in `amount` — NOT `id`/`percentage`,
  // which is the bug this tool's defaults used to trip over.
  const sampleTaxes = [
    {
      key: 's_iva_21',
      id: 's_iva_21',
      name: 'IVA 21%',
      amount: '21',
      scope: 'sales',
      group: 'iva',
      type: 'iva',
    },
    {
      key: 'p_iva_10',
      id: 'p_iva_10',
      name: 'IVA 10%',
      amount: '10',
      scope: 'purchase',
      group: 'iva',
      type: 'iva',
    },
  ];

  describe('get_taxes', () => {
    it('should get all taxes via v2', async () => {
      await tools.get_taxes.handler({});
    });

    it('surfaces the identifier (key/id) and rate (amount) in default fields', async () => {
      (client.get as any).mockResolvedValue({ items: sampleTaxes });

      const result = (await tools.get_taxes.handler({})) as {
        items: Array<Record<string, unknown>>;
      };

      // Regression: these used to come back blank because the defaults asked
      // for `percentage`/`id` instead of the API's real `amount`/`key`.
      expect(result.items[0]).toEqual({
        key: 's_iva_21',
        id: 's_iva_21',
        name: 'IVA 21%',
        amount: '21',
        scope: 'sales',
        group: 'iva',
        type: 'iva',
      });
      expect(result.items[0].key).toBe('s_iva_21');
      expect(result.items[0].amount).toBe('21');
    });

    it('returns only the requested fields when `fields` is provided', async () => {
      (client.get as any).mockResolvedValue({ items: sampleTaxes });

      const result = (await tools.get_taxes.handler({ fields: ['key', 'amount'] })) as {
        items: Array<Record<string, unknown>>;
      };

      expect(result.items[0]).toEqual({ key: 's_iva_21', amount: '21' });
      expect(result.items[0]).not.toHaveProperty('name');
    });

    it('omits fields that are absent from the API response', async () => {
      (client.get as any).mockResolvedValue({ items: [{ key: 's_iva_0', name: 'Exempt' }] });

      const result = (await tools.get_taxes.handler({})) as {
        items: Array<Record<string, unknown>>;
      };

      expect(result.items[0]).toEqual({ key: 's_iva_0', name: 'Exempt' });
      expect(result.items[0]).not.toHaveProperty('amount');
    });

    it('returns full list (no pagination) with items array', async () => {
      (client.get as any).mockResolvedValue({ items: sampleTaxes });

      const result = (await tools.get_taxes.handler({})) as {
        items: Array<Record<string, unknown>>;
      };

      expect(result.items).toHaveLength(2);
      expect(result).not.toHaveProperty('page');
      expect(result).not.toHaveProperty('pageSize');
      expect(result).not.toHaveProperty('total');
      expect(result).not.toHaveProperty('totalPages');
    });

    it('returns only count in summary mode', async () => {
      (client.get as any).mockResolvedValue({ items: sampleTaxes });

      const result = (await tools.get_taxes.handler({ summary: true })) as {
        count: number;
      };

      expect(result).toEqual({ count: 2 });
      expect(result).not.toHaveProperty('total');
      expect(result).not.toHaveProperty('totalPages');
    });
  });
});
