/**
 * @classytic/payroll - Factories
 *
 * Clean object creation patterns
 */

// ============================================================================
// Employee Factory
// ============================================================================

export {
  EmployeeFactory,
  EmployeeBuilder,
  createEmployee,
  type CreateEmployeeParams,
  type EmployeeData,
  type TerminationData,
} from './employee.factory.js';

// ============================================================================
// Payroll Factory
// ============================================================================

export {
  PayrollFactory,
  PayrollBuilder,
  BatchPayrollFactory,
  createPayroll,
  type CreatePayrollParams,
  type PayrollData,
} from './payroll.factory.js';

// ============================================================================
// Compensation Factory
// ============================================================================

export {
  CompensationFactory,
  CompensationBuilder,
  CompensationPresets,
  createCompensation,
  type CreateCompensationParams,
} from './compensation.factory.js';

