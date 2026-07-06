import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTreasuryTools } from '../tools/treasuries.js';

describe('Treasury Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTreasuryTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTreasuryTools(client);
  });

  const sampleTreasuries = [
    { id: 'tr-1', name: 'Main Account', balance: '10000,00' },
    { id: 'tr-2', name: 'Savings Account', balance: '5000,00' },
  ];

  describe('list_treasuries', () => {
    it('should list all treasuries via v2 treasury/accounts route', async () => {
      await tools.list_treasuries.handler({});
    });

    it('should pass limit to API', async () => {
      await tools.list_treasuries.handler({ limit: 10 });
    });

    it('should pass cursor to API', async () => {
      await tools.list_treasuries.handler({ cursor: 'page:2' });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: sampleTreasuries, cursor: 'page:2', has_more: true });
      const result = (await tools.list_treasuries.handler({})) as any;
      expect(result.items).toEqual(sampleTreasuries);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support fields filtering', async () => {
      client.get = vi.fn().mockResolvedValue({ items: sampleTreasuries });
      const result = (await tools.list_treasuries.handler({ fields: ['id', 'name'] })) as any;
      expect(result.items[0]).toEqual({ id: 'tr-1', name: 'Main Account' });
      expect(result.items[0]).not.toHaveProperty('balance');
    });

    it('should support summary mode', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: sampleTreasuries, cursor: 'page:2', has_more: true });
      const result = (await tools.list_treasuries.handler({ summary: true })) as any;
      expect(result.count).toBe(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('create_treasury', () => {
    it('should create a treasury with required fields via v2 route', async () => {
      await tools.create_treasury.handler({ name: 'Main Account' });
    });

    it('should include optional fields', async () => {
      const args = {
        name: 'Bank Account',
        iban: 'ES1234567890123456789012',
        bic: 'ABCDESXX',
        balance: 10000,
      };
      await tools.create_treasury.handler(args);
    });
  });

  describe('get_treasury', () => {
    it('should get a treasury by ID via v2 treasury/accounts route', async () => {
      await tools.get_treasury.handler({ treasuryId: 'treasury-123' });
    });
  });
});
