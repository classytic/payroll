/**
 * @classytic/payroll - Payroll Audit Plugin
 *
 * Mongokit plugin for automatic audit trail capture on all payroll operations.
 * Auto-captures who/when/where for creates and updates.
 *
 * @module @classytic/payroll/core/mongokit-plugins/payroll-audit
 */

import type { Repository } from '@classytic/mongokit';
import type { ObjectId } from '../../types.js';

/**
 * Audit context configuration
 */
export interface AuditContext {
  /** User ID performing the operation */
  userId?: ObjectId;
  /** User name (optional, for logging) */
  userName?: string;
  /** Organization ID (for multi-tenant operations) */
  organizationId?: ObjectId;
}

/**
 * Payroll audit trail plugin
 *
 * Automatically captures audit information on create and update operations:
 * - Creates: Sets createdBy, createdAt, organizationId
 * - Updates: Sets updatedBy, updatedAt
 *
 * @param context - Audit context with user and organization info
 * @returns Mongokit plugin function
 *
 * @example
 * ```typescript
 * // Single-tenant mode with audit
 * const repos = {
 *   payrollRecord: new Repository(PayrollRecordModel, [
 *     payrollAuditPlugin({ userId: admin._id, organizationId: org._id }),
 *   ]),
 * };
 *
 * // Create will automatically set createdBy and createdAt
 * const record = await repos.payrollRecord.create({
 *   employeeId: emp._id,
 *   // ... other fields
 *   // createdBy and createdAt will be auto-added
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Multi-tenant mode with audit and multi-tenant plugin
 * import { multiTenantPlugin } from '../repository-plugins.js';
 *
 * const repos = {
 *   employee: new Repository(EmployeeModel, [
 *     multiTenantPlugin(orgId),           // First: enforce multi-tenancy
 *     payrollAuditPlugin({ userId, organizationId: orgId }), // Second: audit trail
 *   ]),
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Per-request audit context
 * function createAuditedRepos(req: Request) {
 *   const context = {
 *     userId: req.user._id,
 *     userName: req.user.name,
 *     organizationId: req.organization._id,
 *   };
 *
 *   return {
 *     payrollRecord: new Repository(PayrollRecordModel, [
 *       payrollAuditPlugin(context),
 *     ]),
 *   };
 * }
 * ```
 */
export function payrollAuditPlugin(context: AuditContext) {
  return (repo: Repository) => {
    // Hook: before create operation
    repo.on('before:create', async (ctx) => {
      // Set createdBy if userId is available
      if (context.userId) {
        ctx.data.createdBy = context.userId;
      }

      // Always set createdAt timestamp
      ctx.data.createdAt = new Date();

      // Set organizationId if provided and not already set
      if (context.organizationId && !ctx.data.organizationId) {
        ctx.data.organizationId = context.organizationId;
      }
    });

    // Hook: before update operation
    repo.on('before:update', async (ctx) => {
      // Initialize $set if not present
      if (!ctx.data.$set) {
        ctx.data.$set = {};
      }

      // Set updatedBy if userId is available
      if (context.userId) {
        ctx.data.$set.updatedBy = context.userId;
      }

      // Always set updatedAt timestamp
      ctx.data.$set.updatedAt = new Date();
    });
  };
}

/**
 * Read-only audit plugin (tracks access without modification)
 *
 * Logs who accessed what data, useful for compliance and security auditing.
 *
 * @param context - Audit context
 * @param logger - Optional logger function
 * @returns Mongokit plugin function
 *
 * @example
 * ```typescript
 * const repos = {
 *   employee: new Repository(EmployeeModel, [
 *     readAuditPlugin(
 *       { userId: user._id, organizationId: org._id },
 *       (event) => console.log('Access log:', event)
 *     ),
 *   ]),
 * };
 *
 * // This will log the access
 * await repos.employee.getById(employeeId);
 * ```
 */
export function readAuditPlugin(
  context: AuditContext,
  logger?: (event: AuditEvent) => void
) {
  return (repo: Repository) => {
    // Hook: after read operations
    repo.on('after:read', async (ctx) => {
      const event: AuditEvent = {
        operation: 'read',
        model: repo.model,
        userId: context.userId,
        organizationId: context.organizationId,
        timestamp: new Date(),
        query: ctx.query,
      };

      if (logger) {
        logger(event);
      }
    });
  };
}

/**
 * Audit event structure
 */
export interface AuditEvent {
  /** Operation type */
  operation: 'create' | 'read' | 'update' | 'delete';
  /** Model name */
  model: string;
  /** User performing operation */
  userId?: ObjectId;
  /** Organization context */
  organizationId?: ObjectId;
  /** When the operation occurred */
  timestamp: Date;
  /** Query or data involved */
  query?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Full audit trail plugin (create/read/update/delete)
 *
 * Combines both modification and access audit trails.
 *
 * @param context - Audit context
 * @param onEvent - Event handler for all audit events
 * @returns Mongokit plugin function
 *
 * @example
 * ```typescript
 * const auditLog: AuditEvent[] = [];
 *
 * const repos = {
 *   payrollRecord: new Repository(PayrollRecordModel, [
 *     fullAuditPlugin(
 *       { userId: admin._id, organizationId: org._id },
 *       (event) => auditLog.push(event)
 *     ),
 *   ]),
 * };
 * ```
 */
export function fullAuditPlugin(
  context: AuditContext,
  onEvent: (event: AuditEvent) => void | Promise<void>
) {
  return (repo: Repository) => {
    // Use payroll audit for modification tracking
    payrollAuditPlugin(context)(repo);

    // Add access logging
    (['after:read', 'after:create', 'after:update', 'after:delete'] as const).forEach(
      (hookName) => {
        repo.on(hookName, async (ctx) => {
          const operation = hookName.split(':')[1] as AuditEvent['operation'];

          const event: AuditEvent = {
            operation,
            model: repo.model,
            userId: context.userId,
            organizationId: context.organizationId,
            timestamp: new Date(),
            query: ctx.query || ctx.data,
          };

          await onEvent(event);
        });
      }
    );
  };
}
