/**
 * @classytic/payroll - Services
 *
 * High-level service abstractions (INTERNAL USE ONLY)
 *
 * All services enforce multi-tenant isolation. Every method requires
 * `organizationId` parameter to prevent cross-tenant data access.
 *
 * **For Application Code:**
 * - Use `Payroll` class methods (recommended, full orchestration)
 * - Use `findEmployeeSecure()` utility for secure lookups
 * - DO NOT use services directly
 *
 * Services are kept internal for use by Payroll class only.
 */

// ============================================================================
// Employee Service
// ============================================================================

export {
  EmployeeService,
  createEmployeeService,
} from './employee.service.js';

// ============================================================================
// Payroll Service
// ============================================================================

export {
  PayrollService,
  createPayrollService,
} from './payroll.service.js';

// ============================================================================
// Compensation Service
// ============================================================================

export {
  CompensationService,
  createCompensationService,
} from './compensation.service.js';

// ============================================================================
// Tax Withholding Service
// ============================================================================

export {
  TaxWithholdingService,
  createTaxWithholdingService,
  type TaxWithholdingServiceConfig,
  type CreateFromBreakdownParams,
} from './tax-withholding.service.js';
