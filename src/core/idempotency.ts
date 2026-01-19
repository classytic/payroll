/**
 * Idempotency Manager
 *
 * Ensures operations are not duplicated when called with the same key.
 * Uses Stripe-style idempotency pattern for payroll operations.
 *
 * ## Important: In-Memory Cache Limitations
 *
 * This implementation uses an **in-memory LRU cache** which has the following limitations:
 *
 * - **Does NOT persist across server restarts** - cache is lost on restart
 * - **Does NOT work across multiple server instances** - each instance has its own cache
 * - **Only prevents duplicates within the same process lifetime**
 *
 * For production deployments with horizontal scaling or high availability requirements,
 * you should implement database-backed idempotency. See the Payroll class documentation
 * for implementation examples.
 *
 * The database's unique index on `{ employeeId, period.month, period.year }` serves as
 * the primary duplicate protection - this cache is a secondary optimization layer.
 *
 * @see https://stripe.com/docs/api/idempotent_requests
 */

import { LRUCache } from 'lru-cache';
import type { ObjectIdLike } from '../types.js';
import { getLogger } from '../utils/logger.js';

export interface IdempotentResult<T = any> {
  value: T;
  cached: boolean;
  createdAt: Date;
}

/**
 * In-memory idempotency manager for preventing duplicate operations.
 *
 * @warning This is an in-memory cache. For production horizontal scaling,
 * implement database-backed idempotency instead.
 */
export class IdempotencyManager {
  private cache: LRUCache<string, { value: any; createdAt: Date }>;
  private static hasLoggedWarning = false;

  constructor(options: { max?: number; ttl?: number; suppressWarning?: boolean } = {}) {
    this.cache = new LRUCache({
      max: options.max || 10000, // Store 10k keys
      ttl: options.ttl || 1000 * 60 * 60 * 24, // 24 hours default
    });

    // Log production warning once per process
    if (
      !options.suppressWarning &&
      !IdempotencyManager.hasLoggedWarning &&
      process.env.NODE_ENV === 'production'
    ) {
      IdempotencyManager.hasLoggedWarning = true;
      getLogger().warn(
        'IdempotencyManager: Using in-memory cache. ' +
        'For horizontal scaling, implement database-backed idempotency. ' +
        'See @classytic/payroll documentation for implementation guidance.',
        { cacheMax: options.max || 10000, cacheTTL: options.ttl || 86400000 }
      );
    }
  }

  /**
   * Check if key exists and return cached result
   */
  get<T>(key: string): IdempotentResult<T> | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    return {
      value: cached.value,
      cached: true,
      createdAt: cached.createdAt,
    };
  }

  /**
   * Store result for idempotency key
   */
  set<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      createdAt: new Date(),
    });
  }

  /**
   * Execute function with idempotency protection
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    // Check cache first
    const cached = this.get<T>(key);
    if (cached) {
      return cached;
    }

    // Execute function
    const value = await fn();

    // Cache result
    this.set(key, value);

    return {
      value,
      cached: false,
      createdAt: new Date(),
    };
  }

  /**
   * Clear a specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all keys
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  stats(): { size: number; max: number } {
    return {
      size: this.cache.size,
      max: this.cache.max,
    };
  }
}

/**
 * Generate idempotency key for payroll operations
 */
export function generatePayrollIdempotencyKey(
  organizationId: ObjectIdLike,
  employeeId: ObjectIdLike,
  month: number,
  year: number
): string {
  return `payroll:${organizationId}:${employeeId}:${year}-${month}`;
}
