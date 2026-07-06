import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getWarehouseTools } from '../tools/warehouses.js';

describe('Warehouse Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getWarehouseTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getWarehouseTools(client);
  });

  describe('list_warehouses', () => {
    it('should list all warehouses via v2', async () => {
      await tools.list_warehouses.handler();
    });

    it('should normalize v2 envelope {items:[...]}', async () => {
      const mockItems = [
        { id: 'wh1', name: 'Main' },
        { id: 'wh2', name: 'Secondary' },
      ];
      client.get = vi.fn().mockResolvedValue({ items: mockItems });
      const result = (await tools.list_warehouses.handler()) as any;
      expect(result.items).toEqual(mockItems);
    });

    it('should support fields filtering', async () => {
      const mockItems = [{ id: 'wh1', name: 'Main', address: '123 St' }];
      client.get = vi.fn().mockResolvedValue({ items: mockItems });
      const result = (await tools.list_warehouses.handler({ fields: ['id', 'name'] })) as any;
      expect(result.items[0]).toEqual({ id: 'wh1', name: 'Main' });
      expect(result.items[0]).not.toHaveProperty('address');
    });

    it('should support summary mode', async () => {
      const mockItems = [{ id: 'wh1', name: 'Main' }];
      client.get = vi.fn().mockResolvedValue({ items: mockItems });
      const result = (await tools.list_warehouses.handler({ summary: true })) as any;
      expect(result.total).toBe(1);
    });
  });

  describe('create_warehouse', () => {
    it('should create a warehouse with required fields (v2)', async () => {
      await tools.create_warehouse.handler({ name: 'Main Warehouse' });
    });

    it('should include address fields', async () => {
      const args = {
        name: 'Madrid Warehouse',
        address: 'Calle Industrial 123',
        city: 'Madrid',
        postalCode: '28001',
        province: 'Madrid',
        country: 'ES',
      };
      await tools.create_warehouse.handler(args);
    });
  });

  describe('list_warehouse_stock', () => {
    it('should list products stock in warehouse via v2', async () => {
      await tools.list_warehouse_stock.handler({ warehouseId: 'warehouse-123' });
    });

    it('should pass cursor to API', async () => {
      await tools.list_warehouse_stock.handler({ warehouseId: 'warehouse-123', cursor: 'page:2' });
    });

    it('should pass limit to API', async () => {
      await tools.list_warehouse_stock.handler({ warehouseId: 'warehouse-123', limit: 50 });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      const mockItems = [{ product_id: 'p1', stock: 10 }];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_warehouse_stock.handler({
        warehouseId: 'warehouse-123',
      })) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });
  });

  describe('get_warehouse', () => {
    it('should get a warehouse by ID (v2)', async () => {
      await tools.get_warehouse.handler({ warehouseId: 'warehouse-123' });
    });
  });

  describe('update_warehouse', () => {
    it('should update a warehouse using PATCH (v2)', async () => {
      const args = {
        warehouseId: 'warehouse-123',
        name: 'Updated Warehouse',
        city: 'Barcelona',
      };
      await tools.update_warehouse.handler(args);
      expect(client.patch).toHaveBeenCalledWith('/warehouses/warehouse-123', {
        name: 'Updated Warehouse',
        city: 'Barcelona',
      });
    });

    it('should NOT call client.put for update_warehouse', async () => {
      const args = { warehouseId: 'warehouse-123', name: 'Updated' };
      await tools.update_warehouse.handler(args);
      expect(client.put).not.toHaveBeenCalled();
    });
  });

  describe('delete_warehouse', () => {
    it('should delete a warehouse (v2)', async () => {
      await tools.delete_warehouse.handler({ warehouseId: 'warehouse-123' });
    });
  });
});
