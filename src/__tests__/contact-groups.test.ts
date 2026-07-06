import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getContactGroupTools } from '../tools/contact-groups.js';

describe('Contact Group Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getContactGroupTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getContactGroupTools(client);
  });

  describe('list_contact_groups', () => {
    it('should list contact groups via v2 endpoint', async () => {
      await tools.list_contact_groups.handler({});
    });

    it('should pass limit to API', async () => {
      await tools.list_contact_groups.handler({ limit: 20 });
    });

    it('should pass cursor to API', async () => {
      await tools.list_contact_groups.handler({ cursor: 'page:2' });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      const mockItems = [
        { id: 'g1', name: 'VIP' },
        { id: 'g2', name: 'Premium' },
      ];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_contact_groups.handler({})) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support fields filtering', async () => {
      const mockItems = [{ id: 'g1', name: 'VIP', extra: 'unused' }];
      client.get = vi.fn().mockResolvedValue({ items: mockItems });
      const result = (await tools.list_contact_groups.handler({ fields: ['id'] })) as any;
      expect(result.items[0]).toEqual({ id: 'g1' });
      expect(result.items[0]).not.toHaveProperty('name');
    });

    it('should support summary mode returning count', async () => {
      const mockItems = [
        { id: 'g1', name: 'VIP' },
        { id: 'g2', name: 'Premium' },
      ];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_contact_groups.handler({ summary: true })) as any;
      expect(result.count).toBe(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('create_contact_group', () => {
    it('should create a contact group via v2 endpoint', async () => {
      await tools.create_contact_group.handler({ name: 'VIP Clients' });
      expect(client.post).toHaveBeenCalledWith('/contact-groups', { name: 'VIP Clients' });
    });
  });

  describe('get_contact_group', () => {
    it('should get a contact group by ID via v2 endpoint', async () => {
      await tools.get_contact_group.handler({ groupId: 'group-123' });
    });
  });

  describe('update_contact_group', () => {
    it('should update a contact group via v2 endpoint', async () => {
      const args = { groupId: 'group-123', name: 'Premium Clients' };
      await tools.update_contact_group.handler(args);
      expect(client.put).toHaveBeenCalledWith('/contact-groups/group-123', {
        name: 'Premium Clients',
      });
    });
  });

  describe('delete_contact_group', () => {
    it('should delete a contact group via v2 endpoint', async () => {
      await tools.delete_contact_group.handler({ groupId: 'group-123' });
    });
  });
});
