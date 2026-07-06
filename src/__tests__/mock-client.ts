import { vi } from 'vitest';
import { HoldedClient } from '../holded-client.js';

export function createMockClient() {
  const client = new HoldedClient('test-api-key');

  // Mock all HTTP methods
  vi.spyOn(client, 'get').mockResolvedValue([]);
  vi.spyOn(client, 'post').mockResolvedValue({ id: 'new-id', success: true });
  vi.spyOn(client, 'put').mockResolvedValue({ success: true });
  vi.spyOn(client, 'patch').mockResolvedValue({ success: true });
  vi.spyOn(client, 'delete').mockResolvedValue({ success: true });
  vi.spyOn(client, 'uploadFile').mockResolvedValue({ success: true });
  vi.spyOn(client, 'getBinary').mockResolvedValue({
    contentType: 'application/pdf',
    base64: 'JVBERi0=',
    bytes: 4,
  });

  return client;
}
