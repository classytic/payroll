/**
 * Compensation Service - Beautiful Compensation Management
 * Clean abstraction for salary adjustments and calculations
 */

import {
  CompensationFactory,
  CompensationPresets,
} from '../factories/compensation.factory.js';

export class CompensationService {
  constructor(EmployeeModel) {
    this.EmployeeModel = EmployeeModel;
  }

  async getEmployeeCompensation(employeeId) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    return employee.compensation;
  }

  async calculateBreakdown(employeeId) {
    const compensation = await this.getEmployeeCompensation(employeeId);
    return CompensationFactory.calculateBreakdown(compensation);
  }

  async updateBaseAmount(employeeId, newAmount, effectiveFrom) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const updatedCompensation = CompensationFactory.updateBaseAmount(
      employee.compensation,
      newAmount,
      effectiveFrom
    );

    employee.compensation = updatedCompensation;
    await employee.save();

    return this.calculateBreakdown(employeeId);
  }

  async applyIncrement(employeeId, { percentage, amount, effectiveFrom }) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const updatedCompensation = CompensationFactory.applyIncrement(
      employee.compensation,
      { percentage, amount, effectiveFrom }
    );

    employee.compensation = updatedCompensation;
    employee.incrementHistory = employee.incrementHistory || [];
    employee.incrementHistory.push({
      previousAmount: employee.compensation.baseAmount,
      newAmount: updatedCompensation.baseAmount,
      percentage,
      amount,
      effectiveFrom: effectiveFrom || new Date(),
      appliedAt: new Date(),
    });

    await employee.save();

    return this.calculateBreakdown(employeeId);
  }

  async addAllowance(employeeId, allowance) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const updatedCompensation = CompensationFactory.addAllowance(
      employee.compensation,
      allowance
    );

    employee.compensation = updatedCompensation;
    await employee.save();

    return this.calculateBreakdown(employeeId);
  }

  async removeAllowance(employeeId, allowanceType) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const updatedCompensation = CompensationFactory.removeAllowance(
      employee.compensation,
      allowanceType
    );

    employee.compensation = updatedCompensation;
    await employee.save();

    return this.calculateBreakdown(employeeId);
  }

  async addDeduction(employeeId, deduction) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const updatedCompensation = CompensationFactory.addDeduction(
      employee.compensation,
      deduction
    );

    employee.compensation = updatedCompensation;
    await employee.save();

    return this.calculateBreakdown(employeeId);
  }

  async removeDeduction(employeeId, deductionType) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const updatedCompensation = CompensationFactory.removeDeduction(
      employee.compensation,
      deductionType
    );

    employee.compensation = updatedCompensation;
    await employee.save();

    return this.calculateBreakdown(employeeId);
  }

  async setStandardCompensation(employeeId, baseAmount) {
    const employee = await this.EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    employee.compensation = CompensationPresets.standard(baseAmount);
    await employee.save();

    return this.calculateBreakdown(employeeId);
  }

  async compareCompensation(employeeId1, employeeId2) {
    const breakdown1 = await this.calculateBreakdown(employeeId1);
    const breakdown2 = await this.calculateBreakdown(employeeId2);

    return {
      employee1: breakdown1,
      employee2: breakdown2,
      difference: {
        base: breakdown2.baseAmount - breakdown1.baseAmount,
        gross: breakdown2.grossAmount - breakdown1.grossAmount,
        net: breakdown2.netAmount - breakdown1.netAmount,
      },
      ratio: {
        base: breakdown2.baseAmount / breakdown1.baseAmount,
        gross: breakdown2.grossAmount / breakdown1.grossAmount,
        net: breakdown2.netAmount / breakdown1.netAmount,
      },
    };
  }

  async getDepartmentCompensationStats(organizationId, department) {
    const employees = await this.EmployeeModel.find({
      organizationId,
      department,
      status: { $in: ['active', 'on_leave'] },
    });

    const breakdowns = employees.map((emp) =>
      CompensationFactory.calculateBreakdown(emp.compensation)
    );

    const totals = breakdowns.reduce(
      (acc, breakdown) => ({
        totalBase: acc.totalBase + breakdown.baseAmount,
        totalGross: acc.totalGross + breakdown.grossAmount,
        totalNet: acc.totalNet + breakdown.netAmount,
      }),
      { totalBase: 0, totalGross: 0, totalNet: 0 }
    );

    return {
      department,
      employeeCount: employees.length,
      ...totals,
      averageBase: totals.totalBase / employees.length,
      averageGross: totals.totalGross / employees.length,
      averageNet: totals.totalNet / employees.length,
    };
  }

  async getOrganizationCompensationStats(organizationId) {
    const employees = await this.EmployeeModel.find({
      organizationId,
      status: { $in: ['active', 'on_leave'] },
    });

    const breakdowns = employees.map((emp) =>
      CompensationFactory.calculateBreakdown(emp.compensation)
    );

    const totals = breakdowns.reduce(
      (acc, breakdown) => ({
        totalBase: acc.totalBase + breakdown.baseAmount,
        totalGross: acc.totalGross + breakdown.grossAmount,
        totalNet: acc.totalNet + breakdown.netAmount,
      }),
      { totalBase: 0, totalGross: 0, totalNet: 0 }
    );

    const byDepartment = {};
    employees.forEach((emp) => {
      const dept = emp.department || 'unassigned';
      if (!byDepartment[dept]) {
        byDepartment[dept] = { count: 0, totalNet: 0 };
      }
      const breakdown = CompensationFactory.calculateBreakdown(emp.compensation);
      byDepartment[dept].count++;
      byDepartment[dept].totalNet += breakdown.netAmount;
    });

    return {
      employeeCount: employees.length,
      ...totals,
      averageBase: totals.totalBase / employees.length,
      averageGross: totals.totalGross / employees.length,
      averageNet: totals.totalNet / employees.length,
      byDepartment,
    };
  }
}

export const createCompensationService = (EmployeeModel) =>
  new CompensationService(EmployeeModel);
