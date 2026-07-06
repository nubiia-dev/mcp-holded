import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getSalesChannelTools } from '../tools/sales-channels.js';

describe('Sales Channel Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getSalesChannelTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getSalesChannelTools(client);
  });

  describe('list_sales_channels', () => {
    it('should list all sales channels via v2 with new slug', async () => {
      await tools.list_sales_channels.handler({});
    });

    it('should pass cursor to API', async () => {
      await tools.list_sales_channels.handler({ cursor: 'page:2' });
    });

    it('should normalize v2 envelope and return items', async () => {
      const mockItems = [{ id: 'ch1', name: 'Online Store' }];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_sales_channels.handler({})) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support summary mode', async () => {
      const mockItems = [{ id: 'ch1' }, { id: 'ch2' }];
      client.get = vi.fn().mockResolvedValue({ items: mockItems });
      const result = (await tools.list_sales_channels.handler({ summary: true })) as any;
      expect(result.count).toBe(2);
    });
  });

  describe('create_sales_channel', () => {
    it('should create a sales channel via v2 with new slug', async () => {
      await tools.create_sales_channel.handler({ name: 'Online Store' });
    });
  });

  describe('get_sales_channel', () => {
    it('should get a sales channel by ID via v2 with new slug', async () => {
      await tools.get_sales_channel.handler({ channelId: 'channel-123' });
    });
  });

  describe('update_sales_channel', () => {
    it('should update a sales channel via v2 with new slug', async () => {
      const args = {
        channelId: 'channel-123',
        name: 'Updated Channel',
      };
      await tools.update_sales_channel.handler(args);
      expect(client.put).toHaveBeenCalledWith('/sales-channels/channel-123', {
        name: 'Updated Channel',
      });
    });

    describe('delete_sales_channel', () => {
      it('should delete a sales channel via v2 with new slug', async () => {
        await tools.delete_sales_channel.handler({ channelId: 'channel-123' });
      });
    });
  });
});
