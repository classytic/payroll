/**
 * Idempotency Manager
 * Ensures operations are not duplicated when called with the same key
 */

import { LRUCache } from 'lru-cache';
import type { ObjectIdLike } from '../types.js';

export interface IdempotentResult<T = any> {
  value: T;
  cached: boolean;
  createdAt: Date;
}

export class IdempotencyManager {
  private cache: LRUCache<string, { value: any; createdAt: Date }>;

  constructor(options: { max?: number; ttl?: number } = {}) {
    this.cache = new LRUCache({
      max: options.max || 10000, // Store 10k keys
      ttl: options.ttl || 1000 * 60 * 60 * 24, // 24 hours default
    });
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
