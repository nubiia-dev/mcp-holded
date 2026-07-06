import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HoldedClient } from '../holded-client.js';

// Mock node-fetch before importing
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

describe('HoldedClient', () => {
  let client: HoldedClient;
  const mockFetch = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    const nodeFetch = await import('node-fetch');
    vi.mocked(nodeFetch.default).mockImplementation(mockFetch as any);
    client = new HoldedClient('test-api-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('should make GET request with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: 'test' }),
      });

      await client.get('/contacts');

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/invoicing/v1/contacts', {
        method: 'GET',
        headers: {
          key: 'test-api-key',
          'Content-Type': 'application/json',
        },
      });
    });

    it('should add query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: 'test' }),
      });

      await client.get('/contacts', { page: 2, limit: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/invoicing/v1/contacts?page=2&limit=50',
        expect.any(Object)
      );
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      });

      const result = await client.get('/contacts');
      expect(result).toEqual({});
    });

    it('should throw on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(client.get('/contacts')).rejects.toThrow('Holded API error (401): Unauthorized');
    });
  });

  describe('post', () => {
    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'new-123' }),
      });

      const body = { name: 'Test Contact' };
      await client.post('/contacts', body);

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/invoicing/v1/contacts', {
        method: 'POST',
        headers: {
          key: 'test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    });
  });

  describe('put', () => {
    it('should make PUT request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      const body = { name: 'Updated Contact' };
      await client.put('/contacts/123', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/invoicing/v1/contacts/123',
        {
          method: 'PUT',
          headers: {
            key: 'test-api-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
    });
  });

  describe('delete', () => {
    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await client.delete('/contacts/123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/invoicing/v1/contacts/123',
        {
          method: 'DELETE',
          headers: {
            key: 'test-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
    });
  });

  describe('uploadFile', () => {
    it('should upload file with FormData', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      const buffer = Buffer.from('test file content');
      await client.uploadFile('/documents/invoice/123/attach', buffer, 'test.pdf');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/invoicing/v1/documents/invoice/123/attach',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            key: 'test-api-key',
            'content-type': expect.stringContaining('multipart/form-data'),
          }),
          body: expect.anything(),
        })
      );
    });
  });

  describe('v2 api group', () => {
    it('uses the v2 base URL and Bearer auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ items: [] }),
      });

      const v2Client = new HoldedClient('v1-key', 'sk_live_test');
      await v2Client.get('/employees', undefined, 'v2');

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/v2/employees', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer sk_live_test',
          'Content-Type': 'application/json',
        },
      });
    });

    it('throws a configuration error before any network call when the v2 key is missing', async () => {
      const v1Only = new HoldedClient('v1-key');

      await expect(v1Only.get('/employees', undefined, 'v2')).rejects.toThrow(/HOLDED_API_KEY_V2/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reports hasV2() based on constructor args', () => {
      expect(new HoldedClient('k').hasV2()).toBe(false);
      expect(new HoldedClient('k', 'sk_live_x').hasV2()).toBe(true);
    });

    it('enriches 403 errors on v2 with a scope hint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const v2Client = new HoldedClient('v1-key', 'sk_live_test');
      await expect(v2Client.get('/salary-records', undefined, 'v2')).rejects.toThrow(/scope/);
    });

    it('keeps the legacy key header for v1 groups even when a v2 key is set', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([]),
      });

      const v2Client = new HoldedClient('v1-key', 'sk_live_test');
      await v2Client.get('/contacts');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/invoicing/v1/contacts',
        expect.objectContaining({
          headers: { key: 'v1-key', 'Content-Type': 'application/json' },
        })
      );
    });
  });
});
