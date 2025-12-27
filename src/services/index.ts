/**
 * @classytic/payroll - Services
 *
 * High-level service abstractions
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
// Leave Service
// ============================================================================

export {
  LeaveService,
  createLeaveService,
  type LeaveServiceConfig,
  type RequestLeaveParams,
  type ReviewLeaveParams,
  type CancelLeaveParams,
  type LeaveForPayrollParams,
  type LeaveRequestResult,
  type ReviewResult,
  type OverlapCheckResult,
} from './leave.service.js';
