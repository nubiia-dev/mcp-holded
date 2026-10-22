/**
 * Rate Limiter with Sliding Window Algorithm
 *
 * Implements per-tool rate limiting with configurable limits.
 * Supports multi-tenancy preparation (tenantId optional for now).
 */

export interface RateLimitConfig {
  /**
   * Maximum requests allowed in the time window
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Optional: specific limits per tool
   */
  toolLimits?: Record<string, { maxRequests: number; windowMs: number }>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

interface RequestRecord {
  timestamp: number;
}

/**
 * Sliding Window Rate Limiter
 * Uses in-memory storage (can be extended to Redis for distributed systems)
 */
export class RateLimiter {
  private requests: Map<string, RequestRecord[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup old records every minute to prevent memory leaks
    // unref(): the timer must not keep the process alive once the MCP transport closes.
    setInterval(() => this.cleanup(), 60000).unref();
  }

  /**
   * Check if a request should be allowed
   * @param toolName - The tool being called
   * @param tenantId - Optional tenant identifier (for multi-tenancy)
   */
  async checkLimit(toolName: string, tenantId?: string): Promise<RateLimitResult> {
    const key = this.getKey(toolName, tenantId);
    const now = Date.now();
    const limit = this.getLimit(toolName);

    // Get existing requests for this key
    let records = this.requests.get(key) || [];

    // Remove requests outside the sliding window
    const windowStart = now - limit.windowMs;
    records = records.filter((r) => r.timestamp > windowStart);

    // Calculate remaining quota
    const remaining = Math.max(0, limit.maxRequests - records.length);
    const resetTime =
      records.length > 0 ? records[0].timestamp + limit.windowMs : now + limit.windowMs;

    // Check if limit exceeded
    if (records.length >= limit.maxRequests) {
      const oldestRequest = records[0];
      const retryAfter = Math.ceil((oldestRequest.timestamp + limit.windowMs - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    // Add new request record
    records.push({ timestamp: now });
    this.requests.set(key, records);

    return {
      allowed: true,
      remaining: remaining - 1, // Subtract current request
      resetTime,
    };
  }

  /**
   * Get rate limit configuration for a specific tool
   */
  private getLimit(toolName: string): { maxRequests: number; windowMs: number } {
    if (this.config.toolLimits && this.config.toolLimits[toolName]) {
      return this.config.toolLimits[toolName];
    }
    return {
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
    };
  }

  /**
   * Generate unique key for rate limiting
   */
  private getKey(toolName: string, tenantId?: string): string {
    return tenantId ? `${tenantId}:${toolName}` : `default:${toolName}`;
  }

  /**
   * Clean up old request records to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const maxWindow = Math.max(
      this.config.windowMs,
      ...Object.values(this.config.toolLimits || {}).map((l) => l.windowMs)
    );

    for (const [key, records] of this.requests.entries()) {
      const filtered = records.filter((r) => r.timestamp > now - maxWindow);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }

  /**
   * Reset rate limits for a specific key (useful for testing)
   */
  reset(toolName: string, tenantId?: string): void {
    const key = this.getKey(toolName, tenantId);
    this.requests.delete(key);
  }

  /**
   * Get current stats for debugging/monitoring
   */
  getStats(): { totalKeys: number; totalRequests: number } {
    let totalRequests = 0;
    for (const records of this.requests.values()) {
      totalRequests += records.length;
    }
    return {
      totalKeys: this.requests.size,
      totalRequests,
    };
  }
}
