import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter, RateLimitConfig } from '../utils/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not keep the process alive: the cleanup timer is unref-ed', () => {
    const unref = vi.fn();
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);
    new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);
  });

  describe('Basic rate limiting', () => {
    beforeEach(() => {
      const config: RateLimitConfig = {
        maxRequests: 5,
        windowMs: 60000, // 1 minute
      };
      rateLimiter = new RateLimiter(config);
    });

    it('should allow requests within limit', async () => {
      const result1 = await rateLimiter.checkLimit('test_tool');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      const result2 = await rateLimiter.checkLimit('test_tool');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);
    });

    it('should block requests exceeding limit', async () => {
      // Use up all 5 requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit('test_tool');
        expect(result.allowed).toBe(true);
      }

      // 6th request should be blocked
      const blockedResult = await rateLimiter.checkLimit('test_tool');
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
      expect(blockedResult.retryAfter).toBeGreaterThan(0);
    });

    it('should track different tools separately', async () => {
      // Use up all requests for tool1
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit('tool1');
      }

      // tool2 should still be allowed
      const result = await rateLimiter.checkLimit('tool2');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe('Sliding window algorithm', () => {
    beforeEach(() => {
      const config: RateLimitConfig = {
        maxRequests: 3,
        windowMs: 10000, // 10 seconds
      };
      rateLimiter = new RateLimiter(config);
    });

    it('should allow requests after window expires', async () => {
      // Make 3 requests (hit limit)
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit('test_tool');
        expect(result.allowed).toBe(true);
      }

      // 4th request should be blocked
      const blockedResult = await rateLimiter.checkLimit('test_tool');
      expect(blockedResult.allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(11000);

      // Should allow new requests after window expires
      const allowedResult = await rateLimiter.checkLimit('test_tool');
      expect(allowedResult.allowed).toBe(true);
    });

    it('should implement sliding window correctly', async () => {
      // t=0: Make 2 requests
      await rateLimiter.checkLimit('test_tool');
      await rateLimiter.checkLimit('test_tool');

      // t=5s: Make 1 request (total 3, at limit)
      vi.advanceTimersByTime(5000);
      const result3 = await rateLimiter.checkLimit('test_tool');
      expect(result3.allowed).toBe(true);

      // t=5s: 4th request should be blocked
      const blocked = await rateLimiter.checkLimit('test_tool');
      expect(blocked.allowed).toBe(false);

      // t=11s: First 2 requests fall out of window, should allow 1 more
      vi.advanceTimersByTime(6000);
      const result4 = await rateLimiter.checkLimit('test_tool');
      expect(result4.allowed).toBe(true);
    });
  });

  describe('Per-tool limits', () => {
    beforeEach(() => {
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowMs: 60000,
        toolLimits: {
          create_document: { maxRequests: 5, windowMs: 60000 },
          delete_contact: { maxRequests: 2, windowMs: 60000 },
        },
      };
      rateLimiter = new RateLimiter(config);
    });

    it('should apply specific limits to configured tools', async () => {
      // create_document has limit of 5
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit('create_document');
        expect(result.allowed).toBe(true);
      }

      const blocked = await rateLimiter.checkLimit('create_document');
      expect(blocked.allowed).toBe(false);
    });

    it('should apply stricter limit to delete operations', async () => {
      // delete_contact has limit of 2
      const result1 = await rateLimiter.checkLimit('delete_contact');
      expect(result1.allowed).toBe(true);

      const result2 = await rateLimiter.checkLimit('delete_contact');
      expect(result2.allowed).toBe(true);

      const blocked = await rateLimiter.checkLimit('delete_contact');
      expect(blocked.allowed).toBe(false);
    });

    it('should use default limit for unconfigured tools', async () => {
      // list_contacts not in toolLimits, uses default of 10
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.checkLimit('list_contacts');
        expect(result.allowed).toBe(true);
      }

      const blocked = await rateLimiter.checkLimit('list_contacts');
      expect(blocked.allowed).toBe(false);
    });
  });

  describe('Multi-tenancy support', () => {
    beforeEach(() => {
      const config: RateLimitConfig = {
        maxRequests: 3,
        windowMs: 60000,
      };
      rateLimiter = new RateLimiter(config);
    });

    it('should track limits per tenant', async () => {
      // Tenant A uses up all requests
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit('test_tool', 'tenant-a');
        expect(result.allowed).toBe(true);
      }

      const blockedA = await rateLimiter.checkLimit('test_tool', 'tenant-a');
      expect(blockedA.allowed).toBe(false);

      // Tenant B should still be allowed
      const allowedB = await rateLimiter.checkLimit('test_tool', 'tenant-b');
      expect(allowedB.allowed).toBe(true);
    });

    it('should separate default tenant from named tenants', async () => {
      // Use up requests for default tenant
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit('test_tool');
      }

      const blocked = await rateLimiter.checkLimit('test_tool');
      expect(blocked.allowed).toBe(false);

      // Named tenant should still be allowed
      const allowed = await rateLimiter.checkLimit('test_tool', 'tenant-x');
      expect(allowed.allowed).toBe(true);
    });
  });

  describe('Reset and stats', () => {
    beforeEach(() => {
      const config: RateLimitConfig = {
        maxRequests: 5,
        windowMs: 60000,
      };
      rateLimiter = new RateLimiter(config);
    });

    it('should reset limits for specific tool', async () => {
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit('test_tool');
      }

      const blocked = await rateLimiter.checkLimit('test_tool');
      expect(blocked.allowed).toBe(false);

      // Reset
      rateLimiter.reset('test_tool');

      // Should allow requests again
      const allowed = await rateLimiter.checkLimit('test_tool');
      expect(allowed.allowed).toBe(true);
    });

    it('should provide stats', async () => {
      await rateLimiter.checkLimit('tool1');
      await rateLimiter.checkLimit('tool1');
      await rateLimiter.checkLimit('tool2');

      const stats = rateLimiter.getStats();
      expect(stats.totalKeys).toBe(2); // tool1 and tool2
      expect(stats.totalRequests).toBe(3);
    });
  });

  describe('Memory cleanup', () => {
    beforeEach(() => {
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowMs: 10000, // 10 seconds
      };
      rateLimiter = new RateLimiter(config);
    });

    it('should clean up old records', async () => {
      // Make some requests
      await rateLimiter.checkLimit('tool1');
      await rateLimiter.checkLimit('tool2');

      let stats = rateLimiter.getStats();
      expect(stats.totalKeys).toBe(2);
      expect(stats.totalRequests).toBe(2);

      // Advance time past window
      vi.advanceTimersByTime(15000);

      // Trigger cleanup (runs every minute)
      vi.advanceTimersByTime(60000);

      // Old records should be cleaned up
      stats = rateLimiter.getStats();
      expect(stats.totalKeys).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Reset time calculation', () => {
    beforeEach(() => {
      const config: RateLimitConfig = {
        maxRequests: 3,
        windowMs: 10000, // 10 seconds
      };
      rateLimiter = new RateLimiter(config);
    });

    it('should provide accurate reset time', async () => {
      const startTime = Date.now();

      const result1 = await rateLimiter.checkLimit('test_tool');
      expect(result1.resetTime).toBeGreaterThanOrEqual(startTime + 10000);
      expect(result1.resetTime).toBeLessThanOrEqual(startTime + 10001);

      vi.advanceTimersByTime(5000);

      const result2 = await rateLimiter.checkLimit('test_tool');
      // Reset time should still be based on first request
      expect(result2.resetTime).toBeGreaterThanOrEqual(startTime + 10000);
      expect(result2.resetTime).toBeLessThanOrEqual(startTime + 10001);
    });

    it('should provide retryAfter when limit exceeded', async () => {
      // Use up all requests
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit('test_tool');
      }

      // Advance time by 2 seconds
      vi.advanceTimersByTime(2000);

      // 4th request should be blocked with retryAfter
      const blocked = await rateLimiter.checkLimit('test_tool');
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBe(8); // 10 - 2 seconds elapsed
    });
  });
});
