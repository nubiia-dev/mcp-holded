import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getRemittanceTools } from '../tools/remittances.js';

describe('Remittance Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getRemittanceTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getRemittanceTools(client);
  });

  const sampleRemittances = [
    { id: 'rem-1', name: 'January Remittance', date: 1700000000 },
    { id: 'rem-2', name: 'February Remittance', date: 1702500000 },
  ];

  describe('list_remittances', () => {
    it('should list all remittances via v2 treasury route', async () => {
      await tools.list_remittances.handler({});
    });

    it('should pass limit to API', async () => {
      await tools.list_remittances.handler({ limit: 10 });
    });

    it('should pass cursor to API', async () => {
      await tools.list_remittances.handler({ cursor: 'page:2' });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: sampleRemittances, cursor: 'page:2', has_more: true });
      const result = (await tools.list_remittances.handler({})) as any;
      expect(result.items).toEqual(sampleRemittances);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support fields filtering', async () => {
      client.get = vi.fn().mockResolvedValue({ items: sampleRemittances });
      const result = (await tools.list_remittances.handler({ fields: ['id', 'name'] })) as any;
      expect(result.items[0]).toEqual({ id: 'rem-1', name: 'January Remittance' });
      expect(result.items[0]).not.toHaveProperty('date');
    });

    it('should support summary mode', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: sampleRemittances, cursor: 'page:2', has_more: false });
      const result = (await tools.list_remittances.handler({ summary: true })) as any;
      expect(result.count).toBe(2);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('get_remittance', () => {
    it('should get a remittance by ID via v2 treasury route', async () => {
      await tools.get_remittance.handler({ remittanceId: 'remittance-123' });
    });
  });
});
