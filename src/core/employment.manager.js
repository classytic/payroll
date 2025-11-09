import logger from '../utils/logger.js';
import { HRM_CONFIG } from '../config.js';
import { EmployeeFactory } from '../factories/employee.factory.js';
import { employee as employeeQuery } from '../utils/query-builders.js';
import { isEmployed } from '../utils/validation.utils.js';

export async function hireEmployee({
  EmployeeModel,
  organizationId,
  userId,
  employment = {},
  compensation = {},
  bankDetails = {},
  context = {},
  session = null
}) {
  const existingQuery = employeeQuery()
    .forUser(userId)
    .forOrganization(organizationId)
    .employed()
    .build();

  const existing = await EmployeeModel.findOne(existingQuery).session(session);

  if (existing) {
    throw new Error('User is already an active employee in this organization');
  }

  const employeeData = EmployeeFactory.create({
    userId,
    organizationId,
    employment,
    compensation: {
      ...compensation,
      currency: compensation.currency || HRM_CONFIG.payroll.defaultCurrency,
    },
    bankDetails,
  });

  const employee = await EmployeeModel.create([employeeData], { session });

  logger.info('Employee hired', {
    employeeId: employee[0].employeeId,
    organizationId,
    userId,
    position: employment.position,
  });

  return employee[0];
}

export async function updateEmployment({
  EmployeeModel,
  employeeId,
  updates = {},
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (employee.status === 'terminated') {
    throw new Error('Cannot update terminated employee. Use re-hire instead.');
  }

  const allowedUpdates = ['department', 'position', 'employmentType', 'status', 'workSchedule'];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedUpdates.includes(key)) {
      employee[key] = value;
    }
  }

  await employee.save({ session });

  logger.info('Employee updated', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    updates: Object.keys(updates),
  });

  return employee;
}

export async function terminateEmployee({
  EmployeeModel,
  employeeId,
  terminationDate = new Date(),
  reason = 'resignation',
  notes = '',
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  employee.terminate(reason, terminationDate);

  if (notes) {
    employee.notes = (employee.notes || '') + `\nTermination: ${notes}`;
  }

  await employee.save({ session });

  logger.info('Employee terminated', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    reason,
  });

  return employee;
}

export async function reHireEmployee({
  EmployeeModel,
  employeeId,
  hireDate = new Date(),
  position = null,
  department = null,
  compensation = null,
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId).session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (!HRM_CONFIG.employment.allowReHiring) {
    throw new Error('Re-hiring is not enabled');
  }

  employee.reHire(hireDate, position, department);

  if (compensation) {
    employee.compensation = {
      ...employee.compensation,
      ...compensation,
    };
  }

  await employee.save({ session });

  logger.info('Employee re-hired', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
  });

  return employee;
}

export async function getEmployeeList({
  EmployeeModel,
  organizationId,
  filters = {},
  pagination = {},
  session = null
}) {
  let queryBuilder = employeeQuery().forOrganization(organizationId);

  if (filters.status) {
    queryBuilder = queryBuilder.withStatus(filters.status);
  }

  if (filters.department) {
    queryBuilder = queryBuilder.inDepartment(filters.department);
  }

  if (filters.employmentType) {
    queryBuilder = queryBuilder.withEmploymentType(filters.employmentType);
  }

  if (filters.minSalary) {
    queryBuilder = queryBuilder.whereGte('compensation.netSalary', filters.minSalary);
  }

  if (filters.maxSalary) {
    queryBuilder = queryBuilder.whereLte('compensation.netSalary', filters.maxSalary);
  }

  const query = queryBuilder.build();

  const options = {
    page: pagination.page || 1,
    limit: pagination.limit || 20,
    sort: pagination.sort || { createdAt: -1 },
    populate: [
      { path: 'userId', select: 'name email phone' },
    ],
    ...pagination,
  };

  const result = await EmployeeModel.paginate(query, options);

  return result;
}

export async function getEmployeeById({
  EmployeeModel,
  employeeId,
  populateUser = true,
  session = null
}) {
  let query = EmployeeModel.findById(employeeId).session(session);

  if (populateUser) {
    query = query.populate('userId', 'name email phone');
  }

  const employee = await query;

  if (!employee) {
    throw new Error('Employee not found');
  }

  return employee;
}
