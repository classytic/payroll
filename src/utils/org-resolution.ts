/**
 * @classytic/payroll - Organization Resolution Utility
 *
 * Smart organization ID resolution with priority chain:
 * 1. Explicit parameter (highest priority)
 * 2. Context.organizationId (from middleware/auth)
 * 3. Single-tenant config (if autoInject enabled)
 * 4. Error (if none found in multi-tenant mode)
 */

import type { ObjectIdLike, OperationContext } from '../types.js';
import type { Container } from '../core/container.js';
import { toObjectId } from './query-builders.js';
import { Types } from 'mongoose';

/**
 * Container-like interface for organization resolution
 * Only requires the methods we need, allowing any generic Container type
 */
export interface ContainerLike {
  isSingleTenant(): boolean;
  getSingleTenantConfig(): { organizationId?: ObjectIdLike; autoInject?: boolean } | null;
  getOrganizationId(): string | null;
}

/**
 * Organization resolution parameters
 */
export interface ResolveOrganizationIdParams {
  /**
   * Explicitly provided organizationId (highest priority)
   */
  explicit?: ObjectIdLike;

  /**
   * Operation context with possible organizationId
   */
  context?: OperationContext;

  /**
   * Container for single-tenant config access
   * Accepts any Container with any generic types
   */
  container?: ContainerLike;

  /**
   * Operation name for error messages
   */
  operation?: string;
}

/**
 * Smart organization ID resolution
 *
 * Priority Chain:
 * 1. Explicit param (highest)
 * 2. Context.organizationId (middleware/auth)
 * 3. Single-tenant config (if autoInject enabled)
 * 4. Error (if none found)
 *
 * @param params - Resolution parameters
 * @returns Resolved ObjectId
 * @throws Error if organizationId cannot be resolved
 *
 * @example
 * // Explicit param wins
 * const orgId = resolveOrganizationId({
 *   explicit: org._id,
 *   context: { organizationId: other._id },
 *   operation: 'processSalary'
 * });
 * // Returns: org._id
 *
 * @example
 * // Context fallback
 * const orgId = resolveOrganizationId({
 *   context: { organizationId: org._id },
 *   operation: 'processSalary'
 * });
 * // Returns: org._id from context
 *
 * @example
 * // Single-tenant auto-inject
 * const orgId = resolveOrganizationId({
 *   container: singleTenantContainer,
 *   operation: 'processSalary'
 * });
 * // Returns: organizationId from container config
 */
export function resolveOrganizationId(
  params: ResolveOrganizationIdParams
): Types.ObjectId {
  const { explicit, context, container, operation } = params;

  // 1. Explicit param wins
  if (explicit) {
    return toObjectId(explicit);
  }

  // 2. Context from middleware/auth
  if (context?.organizationId) {
    return toObjectId(context.organizationId);
  }

  // 3. Single-tenant auto-inject
  // FIX: Check if single-tenant mode is enabled AND autoInject is not disabled
  if (container?.isSingleTenant()) {
    const singleTenantConfig = container.getSingleTenantConfig();
    const autoInjectEnabled = singleTenantConfig?.autoInject !== false; // default: true

    if (autoInjectEnabled) {
      const orgId = container.getOrganizationId();
      if (orgId) {
        return toObjectId(orgId);
      }
      // Single-tenant with autoInject but no organizationId configured
      const operationName = operation || 'Operation';
      throw new Error(
        `${operationName}: Single-tenant mode with autoInject enabled requires organizationId in configuration.\n\n` +
        'Fix by configuring organizationId:\n' +
        '  const payroll = createPayrollInstance()\n' +
        '    .withModels({ ... })\n' +
        '    .forSingleTenant({ organizationId: YOUR_ORG_ID, autoInject: true })\n' +
        '    .build();\n\n' +
        'Or provide organizationId explicitly in each operation:\n' +
        `  await payroll.${operation || 'method'}({ organizationId: org._id, ... });`
      );
    }
    // autoInject is explicitly disabled - fall through to require explicit orgId
  }

  // 4. Error - no organizationId found (multi-tenant or single-tenant with autoInject: false)
  const operationName = operation || 'Operation';
  const isSingleTenantNoAutoInject = container?.isSingleTenant() &&
    container.getSingleTenantConfig()?.autoInject === false;

  if (isSingleTenantNoAutoInject) {
    throw new Error(
      `${operationName} requires organizationId (autoInject is disabled in single-tenant config).\n\n` +
      'Provide organizationId explicitly:\n' +
      `  await payroll.${operation || 'method'}({ organizationId: org._id, ... });`
    );
  }

  throw new Error(
    `${operationName} requires organizationId in multi-tenant mode.\n\n` +
      'Options:\n' +
      '1. Provide it explicitly in parameters\n' +
      '2. Pass it via context (from middleware/auth)\n' +
      '3. Enable single-tenant mode with autoInject\n\n' +
      'Example (multi-tenant):\n' +
      `  await payroll.${operation || 'method'}({ organizationId: org._id, ... });\n\n` +
      'Example (single-tenant):\n' +
      '  const payroll = createPayrollInstance()\n' +
      '    .withModels({ ... })\n' +
      '    .forSingleTenant({ organizationId: myOrg._id, autoInject: true })\n' +
      '    .build();'
  );
}

/**
 * Validate that organizationId is present
 *
 * @param organizationId - Organization ID to validate
 * @param operation - Operation name for error message
 * @returns ObjectId if valid
 * @throws Error if organizationId is missing or invalid
 */
export function validateOrganizationId(
  organizationId: ObjectIdLike | undefined,
  operation: string
): Types.ObjectId {
  if (!organizationId) {
    throw new Error(
      `${operation} requires organizationId. ` +
        'Provide it explicitly, via context, or enable single-tenant mode with autoInject.'
    );
  }

  try {
    return toObjectId(organizationId);
  } catch (error) {
    throw new Error(
      `${operation} received invalid organizationId: ${organizationId}. ` +
        'Must be a valid ObjectId, ObjectId string, or ObjectId-like object.'
    );
  }
}

/**
 * Try to resolve organizationId without throwing
 *
 * @param params - Resolution parameters
 * @returns ObjectId if resolved, null otherwise
 */
export function tryResolveOrganizationId(
  params: ResolveOrganizationIdParams
): Types.ObjectId | null {
  try {
    return resolveOrganizationId(params);
  } catch {
    return null;
  }
}
