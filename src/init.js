import { hrm } from './hrm.orchestrator.js';
import logger, { setLogger } from './utils/logger.js';

let initialized = false;

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
