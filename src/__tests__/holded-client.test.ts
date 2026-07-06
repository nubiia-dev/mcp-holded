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

  describe('constructor', () => {
    it('throws when the api key is empty', () => {
      expect(() => new HoldedClient('')).toThrow(/HOLDED_API_KEY/);
    });

    it('throws when the api key is empty and names both env vars', () => {
      expect(() => new HoldedClient('')).toThrow(/HOLDED_API_KEY_V2/);
    });

    it('accepts a v2 key without error', () => {
      expect(() => new HoldedClient('pat_abc123')).not.toThrow();
      expect(() => new HoldedClient('sk_live_xyz')).not.toThrow();
    });
  });

  describe('get', () => {
    it('should make GET request with correct Bearer headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: 'test' }),
      });

      await client.get('/contacts');

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/v2/contacts', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-api-key',
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
        'https://api.holded.com/api/v2/contacts?page=2&limit=50',
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

    it('enriches 403 errors with a hint containing "invalid" and "scope"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });
      const err = (await client.get('/salary-records').catch((e) => e)) as Error;
      expect(err.message).toMatch(/invalid/);
      expect(err.message).toMatch(/scope/);
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

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/v2/contacts', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
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

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/v2/contacts/123', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    });
  });

  describe('patch', () => {
    it('should make PATCH request with body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '{}' });

      await client.patch('/warehouses/w1', { name: 'x' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/v2/warehouses/w1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'x' }) })
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

      expect(mockFetch).toHaveBeenCalledWith('https://api.holded.com/api/v2/contacts/123', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('uploadFile', () => {
    it('should upload file with FormData and Bearer auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      const buffer = Buffer.from('test file content');
      await client.uploadFile('/documents/invoice/123/attach', buffer, 'test.pdf');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.holded.com/api/v2/documents/invoice/123/attach',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'content-type': expect.stringContaining('multipart/form-data'),
          }),
          body: expect.anything(),
        })
      );
    });
  });

  describe('getBinary', () => {
    it('returns base64, contentType and bytes from a binary response', async () => {
      const buf = new Uint8Array([1, 2, 3]).buffer;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => buf,
      });
      const result = await (client as any).getBinary('/invoices/doc-1/pdf');
      expect(result.contentType).toBe('application/pdf');
      expect(result.base64).toBe(Buffer.from(new Uint8Array([1, 2, 3])).toString('base64'));
      expect(result.bytes).toBe(3);
    });

    it('falls back to application/octet-stream when content-type header is absent', async () => {
      const buf = new Uint8Array([65]).buffer;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => buf,
      });
      const result = await (client as any).getBinary('/invoices/doc-1/pdf');
      expect(result.contentType).toBe('application/octet-stream');
    });

    it('throws with standard Holded error format on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });
      await expect((client as any).getBinary('/invoices/fake/pdf')).rejects.toThrow(
        'Holded API error (404): Not Found'
      );
    });

    it('includes hint with "invalid" and "scope" on 403 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });
      const err = await (client as any).getBinary('/invoices/doc-1/pdf').catch((e: Error) => e);
      expect(err.message).toMatch(/invalid/);
      expect(err.message).toMatch(/scope/);
    });
  });

  describe('error body truncation', () => {
    it('truncates a 4000-char error body to 500 chars with … [truncated] suffix', async () => {
      const longBody = 'x'.repeat(4000);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => longBody,
      });
      const err = (await client.get('/contacts').catch((e) => e)) as Error;
      expect(err.message).toMatch(/… \[truncated\]$/);
      expect(err.message.length).toBeLessThanOrEqual(600);
    });

    it('does not truncate a short error body', async () => {
      const shortBody = 'Short error message';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => shortBody,
      });
      const err = (await client.get('/contacts').catch((e) => e)) as Error;
      expect(err.message).not.toContain('[truncated]');
      expect(err.message).toContain(shortBody);
    });
  });

  describe('retry logic', () => {
    it('should retry on 429 and eventually succeed', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ data: 'test' }),
        });

      vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

      const result = await client.get('/contacts');
      expect(result).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 and eventually succeed', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ data: 'test' }),
        });

      vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

      const result = await client.get('/contacts');
      expect(result).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries on persistent 503', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

      await expect(client.get('/contacts')).rejects.toThrow('Holded API error (503)');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(client.get('/contacts')).rejects.toThrow('Holded API error (401)');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
