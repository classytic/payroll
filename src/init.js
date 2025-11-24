import { hrm } from './hrm.orchestrator.js';
import logger, { setLogger } from './utils/logger.js';

let initialized = false;

/**
 * Initialize HRM/Payroll framework
 *
 * @param {Object} options - Initialization options
 * @param {Model} options.EmployeeModel - Employee model (required)
 * @param {Model} options.PayrollRecordModel - Payroll record model (required)
 * @param {Model} options.TransactionModel - Transaction model (required)
 * @param {Model} options.AttendanceModel - Optional attendance model for integration
 * @param {Object} options.logger - Optional custom logger
 *
 * @example Multi-Tenant (default)
 * initializeHRM({
 *   EmployeeModel,
 *   PayrollRecordModel,
 *   TransactionModel
 * });
 *
 * @example Single-Tenant
 * // For single-tenant apps, add organizationId with default value in your Employee schema:
 * // organizationId: { type: ObjectId, required: true, default: () => FIXED_ORG_ID }
 */
export function initializeHRM({ EmployeeModel, PayrollRecordModel, TransactionModel, AttendanceModel = null, logger: customLogger }) {
  // Allow users to inject their own logger
  if (customLogger) {
    setLogger(customLogger);
  }

  if (initialized) {
    logger.warn('HRM already initialized, skipping');
    return;
  }

  if (!EmployeeModel || !PayrollRecordModel || !TransactionModel) {
    throw new Error(
      'HRM initialization requires EmployeeModel, PayrollRecordModel, and TransactionModel'
    );
  }

  hrm.configure({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    AttendanceModel,
  });

  initialized = true;

  logger.info('HRM library initialized', {
    hasAttendanceIntegration: !!AttendanceModel,
  });
}

export function isInitialized() {
  return initialized;
}

export default initializeHRM;
