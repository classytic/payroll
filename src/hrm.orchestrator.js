import * as EmploymentManager from './core/employment.manager.js';
import * as CompensationManager from './core/compensation.manager.js';
import * as PayrollManager from './core/payroll.manager.js';
import logger from './utils/logger.js';

class HRMOrchestrator {
  constructor() {
    this._models = null;
    this._initialized = false;
  }

  configure({ EmployeeModel, PayrollRecordModel, TransactionModel, AttendanceModel = null }) {
    if (!EmployeeModel || !PayrollRecordModel || !TransactionModel) {
      throw new Error('EmployeeModel, PayrollRecordModel, and TransactionModel are required');
    }

    this._models = { EmployeeModel, PayrollRecordModel, TransactionModel, AttendanceModel };
    this._initialized = true;

    logger.info('HRM Orchestrator configured', {
      hasEmployeeModel: !!EmployeeModel,
      hasPayrollRecordModel: !!PayrollRecordModel,
      hasTransactionModel: !!TransactionModel,
      hasAttendanceModel: !!AttendanceModel,
    });
  }

  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error(
        'HRM Orchestrator not initialized. ' +
        'Call initializeHRM({ EmployeeModel, PayrollRecordModel, TransactionModel }) in bootstrap.'
      );
    }
  }

  isInitialized() {
    return this._initialized;
  }

  async hire(params) {
    this._ensureInitialized();
    return await EmploymentManager.hireEmployee({ ...this._models, ...params });
  }

  async updateEmployment(params) {
    this._ensureInitialized();
    return await EmploymentManager.updateEmployment({ ...this._models, ...params });
  }

  async terminate(params) {
    this._ensureInitialized();
    return await EmploymentManager.terminateEmployee({ ...this._models, ...params });
  }

  async reHire(params) {
    this._ensureInitialized();
    return await EmploymentManager.reHireEmployee({ ...this._models, ...params });
  }

  async listEmployees(params) {
    this._ensureInitialized();
    return await EmploymentManager.getEmployeeList({ ...this._models, ...params });
  }

  async getEmployee(params) {
    this._ensureInitialized();
    return await EmploymentManager.getEmployeeById({ ...this._models, ...params });
  }

  async updateSalary(params) {
    this._ensureInitialized();
    return await CompensationManager.updateSalary({ ...this._models, ...params });
  }

  async addAllowance(params) {
    this._ensureInitialized();
    return await CompensationManager.addAllowance({ ...this._models, ...params });
  }

  async removeAllowance(params) {
    this._ensureInitialized();
    return await CompensationManager.removeAllowance({ ...this._models, ...params });
  }

  async addDeduction(params) {
    this._ensureInitialized();
    return await CompensationManager.addDeduction({ ...this._models, ...params });
  }

  async removeDeduction(params) {
    this._ensureInitialized();
    return await CompensationManager.removeDeduction({ ...this._models, ...params });
  }

  async updateBankDetails(params) {
    this._ensureInitialized();
    return await CompensationManager.updateBankDetails({ ...this._models, ...params });
  }

  async processSalary(params) {
    this._ensureInitialized();
    return await PayrollManager.processSalary({ ...this._models, ...params });
  }

  async processBulkPayroll(params) {
    this._ensureInitialized();
    return await PayrollManager.processBulkPayroll({ ...this._models, ...params });
  }

  async payrollHistory(params) {
    this._ensureInitialized();
    return await PayrollManager.getPayrollHistory({ ...this._models, ...params });
  }

  async payrollSummary(params) {
    this._ensureInitialized();
    return await PayrollManager.getPayrollSummary({ ...this._models, ...params });
  }

  async exportPayroll(params) {
    this._ensureInitialized();
    return await PayrollManager.exportPayrollData({ ...this._models, ...params });
  }

  getEmployeeModel() {
    this._ensureInitialized();
    return this._models.EmployeeModel;
  }

  getPayrollRecordModel() {
    this._ensureInitialized();
    return this._models.PayrollRecordModel;
  }
}

export const hrmOrchestrator = new HRMOrchestrator();
export const hrm = hrmOrchestrator;
export default hrm;
