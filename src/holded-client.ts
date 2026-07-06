import fetch, { RequestInit } from 'node-fetch';
import FormData from 'form-data';

/**
 * Holded API v2 base URL.
 * All endpoints use Bearer auth with a scoped key (pat_… / sk_live_…).
 */
const API_BASE = 'https://api.holded.com/api/v2';

export class HoldedClient {
  private apiKey: string;
  private maxRetries = 3;
  private backoffDelays = [1000, 2000, 4000]; // milliseconds
  private retryableStatusCodes = new Set([429, 502, 503, 504]);

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        'Holded API key not configured. Set HOLDED_API_KEY_V2 (or HOLDED_API_KEY as fallback) ' +
          'with a v2 key (pat_… or sk_live_…) generated in Holded → Settings → API.'
      );
    }
    this.apiKey = apiKey;
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Truncate error body to 500 chars to avoid huge error messages. */
  private truncateErrorText(text: string): string {
    return text.length > 500 ? text.slice(0, 500) + '… [truncated]' : text;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    queryParams?: Record<string, string | number>
  ): Promise<T> {
    let url = `${API_BASE}${endpoint}`;

    if (queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers = this.buildHeaders();

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    let lastError: Error | null = null;

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Check if response should be retried
        if (!response.ok && this.retryableStatusCodes.has(response.status)) {
          const errorText = this.truncateErrorText(await response.text());
          lastError = new Error(`Holded API error (${response.status}): ${errorText}`);

          // If not last attempt, wait and retry
          if (attempt < this.maxRetries - 1) {
            const delay = this.backoffDelays[attempt];
            await this.sleep(delay);
            continue;
          }
          // Last attempt, throw error
          throw lastError;
        }

        // Non-retryable error
        if (!response.ok) {
          const errorText = this.truncateErrorText(await response.text());
          let message = `Holded API error (${response.status}): ${errorText}`;
          if (response.status === 403) {
            message +=
              ' — the API key may be invalid, or missing the scope this endpoint requires (Holded returns 403 for both). Check the key and its permissions in Holded → Settings → API.';
          }
          throw new Error(message);
        }

        // Success - parse and return response
        const text = await response.text();
        if (!text) {
          return {} as T;
        }

        const parsed = JSON.parse(text) as T;

        // Holded returns HTTP 200 with {status:0, info:"..."} for permission-denied
        // operations (e.g. DELETE on a locked contact). Treat these as errors so
        // callers never silently assume success on a denied write.
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          (parsed as Record<string, unknown>).status === 0 &&
          typeof (parsed as Record<string, unknown>).info === 'string'
        ) {
          const info = (parsed as Record<string, unknown>).info as string;
          throw new Error(`Holded API error (200/denied): ${info}`);
        }

        return parsed;
      } catch (error) {
        // Network errors or other exceptions
        if (error instanceof Error) {
          lastError = error;

          // Only retry if it's a retryable HTTP error
          if (error.message.includes('Holded API error')) {
            const statusMatch = error.message.match(/\((\d+)\)/);
            if (statusMatch) {
              const status = parseInt(statusMatch[1], 10);
              if (this.retryableStatusCodes.has(status) && attempt < this.maxRetries - 1) {
                const delay = this.backoffDelays[attempt];
                await this.sleep(delay);
                continue;
              }
            }
          }
        }

        // Non-retryable error or last attempt
        throw error;
      }
    }

    // Should not reach here, but throw last error just in case
    throw lastError || new Error('Request failed after retries');
  }

  async get<T>(endpoint: string, queryParams?: Record<string, string | number>): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, queryParams);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, body, undefined);
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', endpoint, body, undefined);
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', endpoint, body, undefined);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint, undefined, undefined);
  }

  // Fetch binary content (e.g. PDF) from a Holded endpoint.
  // Returns the response body as base64 together with content-type and byte count.
  // Uses the same Bearer auth and retry semantics as request().
  async getBinary(
    endpoint: string
  ): Promise<{ contentType: string; base64: string; bytes: number }> {
    const url = `${API_BASE}${endpoint}`;
    const headers = this.buildHeaders();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, { method: 'GET', headers });

        if (!response.ok && this.retryableStatusCodes.has(response.status)) {
          const errorText = this.truncateErrorText(await response.text());
          lastError = new Error(`Holded API error (${response.status}): ${errorText}`);
          if (attempt < this.maxRetries - 1) {
            await this.sleep(this.backoffDelays[attempt]);
            continue;
          }
          throw lastError;
        }

        if (!response.ok) {
          const errorText = this.truncateErrorText(await response.text());
          let message = `Holded API error (${response.status}): ${errorText}`;
          if (response.status === 403) {
            message +=
              ' — the API key may be invalid, or missing the scope this endpoint requires (Holded returns 403 for both). Check the key and its permissions in Holded → Settings → API.';
          }
          throw new Error(message);
        }

        const buf = await response.arrayBuffer();
        return {
          contentType: response.headers.get('content-type') ?? 'application/octet-stream',
          base64: Buffer.from(buf).toString('base64'),
          bytes: buf.byteLength,
        };
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
          if (error.message.includes('Holded API error')) {
            const statusMatch = error.message.match(/\((\d+)\)/);
            if (statusMatch) {
              const status = parseInt(statusMatch[1], 10);
              if (this.retryableStatusCodes.has(status) && attempt < this.maxRetries - 1) {
                await this.sleep(this.backoffDelays[attempt]);
                continue;
              }
            }
          }
        }
        throw error;
      }
    }

    throw lastError || new Error('Binary request failed after retries');
  }

  // File upload for attachments with retry logic.
  // Content-Type is omitted and set automatically by FormData so the boundary is included correctly.
  async uploadFile(endpoint: string, file: Buffer, filename: string): Promise<unknown> {
    const url = `${API_BASE}${endpoint}`;
    let lastError: Error | null = null;

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const formData = new FormData();
        formData.append('file', file, filename);

        // Use buildHeaders for auth, then drop Content-Type (FormData sets its own with boundary)
        const authHeaders = { ...this.buildHeaders() };
        delete authHeaders['Content-Type'];

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            ...authHeaders,
            ...formData.getHeaders(),
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          body: formData as any, // FormData from form-data package is not compatible with native BodyInit type
        });

        // Check if response should be retried
        if (!response.ok && this.retryableStatusCodes.has(response.status)) {
          const errorText = this.truncateErrorText(await response.text());
          lastError = new Error(`Holded API error (${response.status}): ${errorText}`);

          // If not last attempt, wait and retry
          if (attempt < this.maxRetries - 1) {
            const delay = this.backoffDelays[attempt];
            await this.sleep(delay);
            continue;
          }
          // Last attempt, throw error
          throw lastError;
        }

        // Non-retryable error
        if (!response.ok) {
          const errorText = this.truncateErrorText(await response.text());
          throw new Error(`Holded API error (${response.status}): ${errorText}`);
        }

        // Success - parse and return response
        const text = await response.text();
        if (!text) {
          return {};
        }

        return JSON.parse(text);
      } catch (error) {
        // Network errors or other exceptions
        if (error instanceof Error) {
          lastError = error;

          // Only retry if it's a retryable HTTP error
          if (error.message.includes('Holded API error')) {
            const statusMatch = error.message.match(/\((\d+)\)/);
            if (statusMatch) {
              const status = parseInt(statusMatch[1], 10);
              if (this.retryableStatusCodes.has(status) && attempt < this.maxRetries - 1) {
                const delay = this.backoffDelays[attempt];
                await this.sleep(delay);
                continue;
              }
            }
          }
        }

        // Non-retryable error or last attempt
        throw error;
      }
    }

    // Should not reach here, but throw last error just in case
    throw lastError || new Error('File upload failed after retries');
  }
}
