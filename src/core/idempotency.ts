/**
 * Idempotency Manager
 *
 * Ensures operations are not duplicated when called with the same key.
 * Uses Stripe-style idempotency pattern for payroll operations.
 *
 * ## Key Format (v2.9.0+)
 *
 * Idempotency keys support multiple payroll frequencies:
 *
 * **Monthly frequency:**
 * ```
 * payroll:{organizationId}:{employeeId}:{year}-{month}:{payrollRunType}
 * ```
 *
 * **Non-monthly frequencies (weekly, bi_weekly, daily, hourly):**
 * ```
 * payroll:{organizationId}:{employeeId}:{year}-{month}:{startDate}:{payrollRunType}
 * ```
 *
 * This allows:
 * - Different payroll types (regular, supplemental, retroactive) in the same period
 * - Multiple weekly/bi-weekly/daily payroll runs within the same calendar month
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
 * ## Duplicate Protection (v2.9.0+)
 *
 * Primary duplicate protection is via **database unique compound index**:
 * `{ organizationId, employeeId, period.month, period.year, period.startDate, payrollRunType }`
 *
 * This prevents race conditions under concurrent load. The partial filter
 * excludes voided records to allow re-processing after restoration.
 *
 * The in-memory cache is a secondary optimization layer, not the primary protection.
 *
 * @see https://stripe.com/docs/api/idempotent_requests
 */

import { LRUCache } from 'lru-cache';
import type { ObjectIdLike } from '../types.js';
import { getLogger } from '../utils/logger.js';

export interface IdempotentResult<T = unknown> {
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
  private cache: LRUCache<string, { value: unknown; createdAt: Date }>;
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
      value: cached.value as T,
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
 * Payroll run types for idempotency key generation
 */
export type PayrollRunType = 'regular' | 'off-cycle' | 'supplemental' | 'retroactive';

/**
 * Generate idempotency key for payroll operations
 *
 * Includes payrollRunType to allow multiple payroll runs per period
 * (e.g., regular + supplemental bonus + retroactive adjustment)
 *
 * For non-monthly frequencies (weekly, bi_weekly, daily, hourly), the periodStartDate
 * is included to differentiate multiple runs within the same calendar month.
 *
 * @param organizationId - Organization ID
 * @param employeeId - Employee ID
 * @param month - Payroll month (1-12)
 * @param year - Payroll year
 * @param payrollRunType - Type of payroll run (default: 'regular')
 * @param periodStartDate - Period start date (required for non-monthly frequencies)
 */
export function generatePayrollIdempotencyKey(
  organizationId: ObjectIdLike,
  employeeId: ObjectIdLike,
  month: number,
  year: number,
  payrollRunType: PayrollRunType = 'regular',
  periodStartDate?: Date
): string {
  // For non-monthly frequencies, include the period start date to differentiate
  // multiple runs within the same calendar month
  if (periodStartDate) {
    const startDateStr = periodStartDate.toISOString().split('T')[0]; // YYYY-MM-DD
    return `payroll:${organizationId}:${employeeId}:${year}-${month}:${startDateStr}:${payrollRunType}`;
  }
  return `payroll:${organizationId}:${employeeId}:${year}-${month}:${payrollRunType}`;
}
