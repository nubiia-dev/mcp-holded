import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getProductTools } from '../tools/products.js';

describe('Product Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getProductTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getProductTools(client);
  });

  describe('list_products', () => {
    it('should list all products via v2', async () => {
      await tools.list_products.handler({});
    });

    it('should pass limit to API', async () => {
      await tools.list_products.handler({ limit: 10 });
    });

    it('should pass cursor to API', async () => {
      await tools.list_products.handler({ cursor: 'page:2' });
    });

    it('should pass limit and cursor together', async () => {
      await tools.list_products.handler({ limit: 20, cursor: 'page:3' });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      const mockItems = [
        { id: 'p1', name: 'Widget' },
        { id: 'p2', name: 'Gadget' },
      ];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_products.handler({})) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support fields filtering preserving nextCursor and hasMore', async () => {
      const mockItems = [{ id: 'p1', name: 'Widget', sku: 'W-001' }];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_products.handler({ fields: ['id', 'name'] })) as any;
      expect(result.items[0]).toEqual({ id: 'p1', name: 'Widget' });
      expect(result.items[0]).not.toHaveProperty('sku');
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support summary mode', async () => {
      const mockItems = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        name: `Product ${i}`,
      }));
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_products.handler({ summary: true })) as any;
      expect(result.count).toBe(5);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('create_product', () => {
    it('should create a product with required fields (v2)', async () => {
      await tools.create_product.handler({ name: 'Test Product' });
    });

    it('should include optional fields', async () => {
      const args = {
        name: 'Test Product',
        sku: 'SKU-001',
        barcode: '1234567890',
        price: 99.99,
        costPrice: 50,
        tax: 21,
        description: 'A test product',
        stock: 100,
        kind: 'product' as const,
      };
      await tools.create_product.handler(args);
    });
  });

  describe('get_product', () => {
    it('should get a product by ID (v2)', async () => {
      await tools.get_product.handler({ productId: 'product-123' });
    });
  });

  describe('update_product', () => {
    it('should update a product (v2)', async () => {
      const args = {
        productId: 'product-123',
        name: 'Updated Product',
        price: 149.99,
      };
      await tools.update_product.handler(args);
      expect(client.put).toHaveBeenCalledWith('/products/product-123', {
        name: 'Updated Product',
        price: 149.99,
      });
    });
  });

  describe('delete_product', () => {
    it('should delete a product (v2)', async () => {
      await tools.delete_product.handler({ productId: 'product-123' });
    });
  });

  describe('get_product_main_image', () => {
    it('should get product main image (v2)', async () => {
      await tools.get_product_main_image.handler({ productId: 'product-123' });
    });
  });

  describe('list_product_images', () => {
    it('should list product images (v2)', async () => {
      await tools.list_product_images.handler({ productId: 'product-123' });
    });
  });

  describe('get_product_secondary_image', () => {
    it('should get a secondary image (v2)', async () => {
      await tools.get_product_secondary_image.handler({
        productId: 'product-123',
        imageId: 'image-456',
      });
    });
  });

  describe('update_product_stock', () => {
    it('should require warehouse_id in inputSchema', () => {
      expect(tools.update_product_stock.inputSchema.required).toContain('warehouse_id');
    });

    it('should update product stock with stock_variation and warehouse_id (v2)', async () => {
      await tools.update_product_stock.handler({
        productId: 'product-123',
        warehouse_id: 'warehouse-1',
        stock_variation: 50,
      });
      expect(client.put).toHaveBeenCalledWith('/products/product-123/stock', {
        stock_variation: 50,
        warehouse_id: 'warehouse-1',
      });
    });

    it('should include optional variant_id and description', async () => {
      await tools.update_product_stock.handler({
        productId: 'product-123',
        warehouse_id: 'warehouse-1',
        stock_variation: -10,
        variant_id: 'var-abc',
        description: 'Inventory adjustment',
      });
      expect(client.put).toHaveBeenCalledWith('/products/product-123/stock', {
        stock_variation: -10,
        warehouse_id: 'warehouse-1',
        variant_id: 'var-abc',
        description: 'Inventory adjustment',
      });
    });

    it('should reject call without warehouse_id', async () => {
      await expect(
        tools.update_product_stock.handler({
          productId: 'product-123',
          stock_variation: 10,
        } as any)
      ).rejects.toThrow();
    });
  });
});
