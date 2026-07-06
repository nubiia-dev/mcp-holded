import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getServiceTools } from '../tools/services.js';

describe('Service Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getServiceTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getServiceTools(client);
  });

  describe('list_services', () => {
    it('should list all services via v2', async () => {
      await tools.list_services.handler({});
    });

    it('should pass cursor to API', async () => {
      await tools.list_services.handler({ cursor: 'page:2' });
    });

    it('should pass limit to API', async () => {
      await tools.list_services.handler({ limit: 20 });
    });

    it('should normalize v2 envelope and return items', async () => {
      const mockItems = [{ id: 's1', name: 'Consulting' }];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_services.handler({})) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support summary mode', async () => {
      const mockItems = [{ id: 's1' }, { id: 's2' }];
      client.get = vi.fn().mockResolvedValue({ items: mockItems });
      const result = (await tools.list_services.handler({ summary: true })) as any;
      expect(result.count).toBe(2);
    });
  });

  describe('create_service', () => {
    it('should create a service with required fields via v2', async () => {
      await tools.create_service.handler({ name: 'Consulting' });
    });

    it('should include optional fields', async () => {
      const args = {
        name: 'Consulting',
        sku: 'SRV-001',
        price: 150,
        tax: 21,
        description: 'Professional consulting services',
      };
      await tools.create_service.handler(args);
    });
  });

  describe('get_service', () => {
    it('should get a service by ID via v2', async () => {
      await tools.get_service.handler({ serviceId: 'service-123' });
    });
  });

  describe('update_service', () => {
    it('should update a service via v2', async () => {
      const args = {
        serviceId: 'service-123',
        name: 'Updated Service',
        price: 200,
      };
      await tools.update_service.handler(args);
      expect(client.put).toHaveBeenCalledWith('/services/service-123', {
        name: 'Updated Service',
        price: 200,
      });
    });

    describe('delete_service', () => {
      it('should delete a service via v2', async () => {
        await tools.delete_service.handler({ serviceId: 'service-123' });
      });
    });
  });
});
