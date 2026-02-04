/**
 * @classytic/payroll - Mongokit Plugins
 *
 * Custom mongokit plugins for payroll-specific functionality.
 *
 * @module @classytic/payroll/core/mongokit-plugins
 */

export {
  payrollAuditPlugin,
  readAuditPlugin,
  fullAuditPlugin,
  type AuditContext,
  type AuditEvent,
} from './payroll-audit.plugin.js';
