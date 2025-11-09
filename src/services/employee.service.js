/**
 * Employee Service - Clean Abstraction for Employee Operations
 * Dependency injection, testable, beautiful API
 */

import { EmployeeFactory } from '../factories/employee.factory.js';
import { employee as employeeQuery } from '../utils/query-builders.js';
import {
  isActive,
  isEmployed,
  canReceiveSalary,
} from '../utils/validation.utils.js';

export class EmployeeService {
  constructor(EmployeeModel) {
    this.EmployeeModel = EmployeeModel;
  }

  async findById(employeeId) {
    return this.EmployeeModel.findById(employeeId);
  }

  async findByUserId(userId, organizationId) {
    const query = employeeQuery()
      .forUser(userId)
      .forOrganization(organizationId)
      .build();

    return this.EmployeeModel.findOne(query);
  }

  async findActive(organizationId, options = {}) {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .active()
      .build();

    return this.EmployeeModel.find(query, options.projection);
  }

  async findEmployed(organizationId, options = {}) {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .employed()
      .build();

    return this.EmployeeModel.find(query, options.projection);
  }

  async findByDepartment(organizationId, department) {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .inDepartment(department)
      .active()
      .build();

    return this.EmployeeModel.find(query);
  }

  async findEligibleForPayroll(organizationId, month, year) {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .employed()
      .build();

    const employees = await this.EmployeeModel.find(query);
    return employees.filter(canReceiveSalary);
  }

  async create(data) {
    const employeeData = EmployeeFactory.create(data);
    return this.EmployeeModel.create(employeeData);
  }

  async updateStatus(employeeId, status, context = {}) {
    const employee = await this.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    employee.status = status;
    employee.statusHistory = employee.statusHistory || [];
    employee.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: {
        userId: context.userId,
        name: context.userName,
      },
      reason: context.reason,
    });

    return employee.save();
  }

  async terminate(employeeId, reason, context = {}) {
    const employee = await this.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const terminationData = EmployeeFactory.createTermination({
      reason,
      notes: context.notes,
      context,
    });

    employee.status = 'terminated';
    Object.assign(employee, terminationData);

    return employee.save();
  }

  async updateCompensation(employeeId, compensation) {
    return this.EmployeeModel.findByIdAndUpdate(
      employeeId,
      { compensation, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
  }

  async getEmployeeStats(organizationId) {
    const query = employeeQuery().forOrganization(organizationId).build();

    const employees = await this.EmployeeModel.find(query);

    return {
      total: employees.length,
      active: employees.filter(isActive).length,
      employed: employees.filter(isEmployed).length,
      canReceiveSalary: employees.filter(canReceiveSalary).length,
      byStatus: this.groupByStatus(employees),
      byDepartment: this.groupByDepartment(employees),
    };
  }

  groupByStatus(employees) {
    return employees.reduce((acc, emp) => {
      acc[emp.status] = (acc[emp.status] || 0) + 1;
      return acc;
    }, {});
  }

  groupByDepartment(employees) {
    return employees.reduce((acc, emp) => {
      const dept = emp.department || 'unassigned';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});
  }

  isActive(employee) {
    return isActive(employee);
  }

  isEmployed(employee) {
    return isEmployed(employee);
  }

  canReceiveSalary(employee) {
    return canReceiveSalary(employee);
  }
}

export const createEmployeeService = (EmployeeModel) =>
  new EmployeeService(EmployeeModel);
