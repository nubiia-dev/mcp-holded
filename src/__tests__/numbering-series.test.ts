import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getNumberingSeriesTools } from '../tools/numbering-series.js';

describe('Numbering Series Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getNumberingSeriesTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getNumberingSeriesTools(client);
  });

  describe('get_numbering_series', () => {
    it('should list numbering series via v2 route', async () => {
      await tools.get_numbering_series.handler({ docType: 'invoice' });
    });

    it('should pass limit to API', async () => {
      await tools.get_numbering_series.handler({ docType: 'estimate', limit: 10 });
    });

    it('should pass cursor to API', async () => {
      await tools.get_numbering_series.handler({ docType: 'invoice', cursor: 'page:2' });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      const mockItems = [
        { id: 's1', name: '2024 Series', prefix: 'INV-' },
        { id: 's2', name: '2025 Series', prefix: 'INV2025-' },
      ];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.get_numbering_series.handler({ docType: 'invoice' })) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support fields filtering', async () => {
      const mockItems = [{ id: 's1', name: '2024 Series', prefix: 'INV-' }];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.get_numbering_series.handler({
        docType: 'invoice',
        fields: ['id', 'name'],
      })) as any;
      expect(result.items[0]).toEqual({ id: 's1', name: '2024 Series' });
      expect(result.items[0]).not.toHaveProperty('prefix');
      expect(result.nextCursor).toBe('page:2');
    });

    it('should support summary mode', async () => {
      const mockItems = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, name: `Serie ${i}` }));
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.get_numbering_series.handler({
        docType: 'invoice',
        summary: true,
      })) as any;
      expect(result.count).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should work with different document types', async () => {
      await tools.get_numbering_series.handler({ docType: 'estimate' });
    });
  });

  describe('create_numbering_serie', () => {
    it('should create a numbering serie via v2 route', async () => {
      const args = {
        docType: 'invoice',
        name: '2024 Series',
      };
      await tools.create_numbering_serie.handler(args);
    });

    it('should include optional fields', async () => {
      const args = {
        docType: 'invoice',
        name: '2024 Series',
        prefix: 'INV-2024-',
        nextNumber: 1,
      };
      await tools.create_numbering_serie.handler(args);
      expect(client.post).toHaveBeenCalledWith('/numbering-series/invoice', {
        name: '2024 Series',
        prefix: 'INV-2024-',
        nextNumber: 1,
      });
    });
  });

  describe('update_numbering_serie', () => {
    it('should update a numbering serie via v2 route', async () => {
      const args = {
        docType: 'invoice',
        serieId: 'serie-123',
        name: 'Updated Series',
        nextNumber: 100,
      };
      await tools.update_numbering_serie.handler(args);
      expect(client.put).toHaveBeenCalledWith('/numbering-series/invoice/serie-123', {
        name: 'Updated Series',
        nextNumber: 100,
      });
    });
  });

  describe('delete_numbering_serie', () => {
    it('should delete a numbering serie via v2 route', async () => {
      await tools.delete_numbering_serie.handler({
        docType: 'invoice',
        serieId: 'serie-123',
      });
    });
  });
});
