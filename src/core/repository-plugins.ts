/**
 * Repository plugins for mongokit integration
 */

import type { Plugin } from '@classytic/mongokit';
import type { ObjectId } from '../types.js';
import { toObjectId } from '../utils/query-builders.js';

/** Hook context for create operations */
interface CreateHookContext {
  data?: Record<string, unknown> | Record<string, unknown>[];
}

/** Hook context for filter-based operations (getAll, getById, update, delete) */
interface FilterHookContext {
  filters?: Record<string, unknown>;
}

/** Hook context for query-based operations (getByQuery) */
interface QueryHookContext {
  query?: Record<string, unknown>;
}

/**
 * Multi-tenant plugin - automatically injects organizationId into all repository operations.
 *
 * Hooks into create, getAll, getById, getByQuery, update, and delete operations
 * to enforce organizational isolation. The organizationId is force-set on creates
 * (cannot be overridden by caller) and added as a filter on all read/write operations.
 *
 * @param organizationId - Organization ID to scope all operations to. If undefined, plugin is a no-op.
 * @returns Mongokit Plugin instance
 *
 * @example
 * ```typescript
 * import { multiTenantPlugin } from '@classytic/payroll';
 * import { Repository } from '@classytic/mongokit';
 *
 * const repo = new Repository(EmployeeModel, [
 *   multiTenantPlugin(organizationId),
 * ]);
 *
 * // All operations auto-scoped to organizationId
 * await repo.getAll({ filters: { status: 'active' } });
 * // Executes: { organizationId, status: 'active' }
 * ```
 */
export function multiTenantPlugin(organizationId?: ObjectId): Plugin {
  return {
    name: 'multi-tenant',
    apply(repo) {
      if (!organizationId) return;

      const orgId = toObjectId(organizationId);

      // Inject organizationId into create operations (ALWAYS enforce, never allow override)
      repo.on('before:create', async (context: CreateHookContext) => {
        if (context.data) {
          if (Array.isArray(context.data)) {
            context.data = context.data.map((item: Record<string, unknown>) => ({
              ...item,
              organizationId: orgId, // CRITICAL: Force override - never allow caller to set different orgId
            }));
          } else {
            context.data = {
              ...context.data,
              organizationId: orgId, // CRITICAL: Force override - never allow caller to set different orgId
            };
          }
        }
      });

      // Add organizationId filter to getAll operations
      repo.on('before:getAll', async (context: FilterHookContext) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });

      // Add organizationId filter to getById operations
      repo.on('before:getById', async (context: FilterHookContext) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });

      // Add organizationId filter to getByQuery operations
      repo.on('before:getByQuery', async (context: QueryHookContext) => {
        // Directly modify query object to ensure organizationId is set
        if (!context.query) {
          context.query = {};
        }
        context.query.organizationId = orgId;
      });

      // Add organizationId filter to update operations
      repo.on('before:update', async (context: FilterHookContext) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });

      // Add organizationId filter to delete operations
      repo.on('before:delete', async (context: FilterHookContext) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });
    },
  };
}

