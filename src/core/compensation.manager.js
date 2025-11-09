import logger from '../utils/logger.js';

export async function updateSalary({
  EmployeeModel,
  employeeId,
  compensation = {},
  effectiveFrom = new Date(),
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (employee.status === 'terminated') {
    throw new Error('Cannot update salary for terminated employee');
  }

  const oldSalary = employee.compensation.netSalary;

  if (compensation.baseAmount !== undefined) {
    employee.compensation.baseAmount = compensation.baseAmount;
  }

  if (compensation.frequency) {
    employee.compensation.frequency = compensation.frequency;
  }

  if (compensation.currency) {
    employee.compensation.currency = compensation.currency;
  }

  employee.compensation.effectiveFrom = effectiveFrom;
  employee.updateSalaryCalculations();

  await employee.save({ session });

  logger.info('Salary updated', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    oldSalary,
    newSalary: employee.compensation.netSalary,
    effectiveFrom,
  });

  return employee;
}

export async function addAllowance({
  EmployeeModel,
  employeeId,
  type,
  amount,
  taxable = true,
  recurring = true,
  effectiveFrom = new Date(),
  effectiveTo = null,
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (employee.status === 'terminated') {
    throw new Error('Cannot add allowance to terminated employee');
  }

  if (!employee.compensation.allowances) {
    employee.compensation.allowances = [];
  }

  employee.compensation.allowances.push({
    type,
    amount,
    taxable,
    recurring,
    effectiveFrom,
    effectiveTo,
  });

  employee.updateSalaryCalculations();

  await employee.save({ session });

  logger.info('Allowance added', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    type,
    amount,
  });

  return employee;
}

export async function removeAllowance({
  EmployeeModel,
  employeeId,
  type,
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  const before = employee.compensation.allowances?.length || 0;
  employee.removeAllowance(type);
  const after = employee.compensation.allowances?.length || 0;

  if (before === after) {
    throw new Error(`Allowance type '${type}' not found`);
  }

  await employee.save({ session });

  logger.info('Allowance removed', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    type,
  });

  return employee;
}

export async function addDeduction({
  EmployeeModel,
  employeeId,
  type,
  amount,
  auto = false,
  recurring = true,
  description = '',
  effectiveFrom = new Date(),
  effectiveTo = null,
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (employee.status === 'terminated') {
    throw new Error('Cannot add deduction to terminated employee');
  }

  if (!employee.compensation.deductions) {
    employee.compensation.deductions = [];
  }

  employee.compensation.deductions.push({
    type,
    amount,
    auto,
    recurring,
    description,
    effectiveFrom,
    effectiveTo,
  });

  employee.updateSalaryCalculations();

  await employee.save({ session });

  logger.info('Deduction added', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    type,
    amount,
    auto,
  });

  return employee;
}

export async function removeDeduction({
  EmployeeModel,
  employeeId,
  type,
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  const before = employee.compensation.deductions?.length || 0;
  employee.removeDeduction(type);
  const after = employee.compensation.deductions?.length || 0;

  if (before === after) {
    throw new Error(`Deduction type '${type}' not found`);
  }

  await employee.save({ session });

  logger.info('Deduction removed', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    type,
  });

  return employee;
}

export async function updateBankDetails({
  EmployeeModel,
  employeeId,
  bankDetails = {},
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  employee.bankDetails = {
    ...employee.bankDetails,
    ...bankDetails,
  };

  await employee.save({ session });

  logger.info('Bank details updated', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
  });

  return employee;
}
