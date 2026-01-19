/**
 * Repository plugins for mongokit integration
 */

import type { Plugin } from '@classytic/mongokit';
import type { ObjectId } from '../types.js';
import { toObjectId } from '../utils/query-builders.js';

/**
 * Multi-tenant plugin - automatically injects organizationId into queries
 */
export function multiTenantPlugin(organizationId?: ObjectId): Plugin {
  return {
    name: 'multi-tenant',
    apply(repo) {
      if (!organizationId) return;

      const orgId = toObjectId(organizationId);

      // Inject organizationId into create operations (ALWAYS enforce, never allow override)
      repo.on('before:create', async (context: any) => {
        if (context.data) {
          if (Array.isArray(context.data)) {
            context.data = context.data.map((item: any) => ({
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
      repo.on('before:getAll', async (context: any) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });

      // Add organizationId filter to getById operations
      repo.on('before:getById', async (context: any) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });

      // Add organizationId filter to getByQuery operations
      repo.on('before:getByQuery', async (context: any) => {
        // Directly modify query object to ensure organizationId is set
        if (!context.query) {
          context.query = {};
        }
        context.query.organizationId = orgId;
      });

      // Add organizationId filter to update operations
      repo.on('before:update', async (context: any) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });

      // Add organizationId filter to delete operations
      repo.on('before:delete', async (context: any) => {
        // Always inject organizationId, even if filters is empty
        context.filters = {
          ...(context.filters || {}),
          organizationId: orgId,
        };
      });
    },
  };
}

