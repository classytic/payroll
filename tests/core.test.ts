/**
 * @classytic/payroll - Core Tests
 *
 * Basic functionality tests for the migrated TypeScript package
 */

import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  // Main exports
  Payroll,
  PayrollBuilder,
  createPayrollInstance,
  getPayroll,
  resetPayroll,

  // Enums
  EMPLOYMENT_TYPE,
  EMPLOYEE_STATUS,
  DEPARTMENT,
  PAYMENT_FREQUENCY,
  PAYROLL_STATUS,

  // Config
  HRM_CONFIG,
  mergeConfig,

  // Utils
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  diffInDays,
  sum,
  sumBy,
  calculateGross,
  calculateNet,
  isActive,
  isTerminated,
  canReceiveSalary,

  // Query Builders
  QueryBuilder,
  EmployeeQueryBuilder,
  PayrollQueryBuilder,
  employee,
  payroll,
  toObjectId,

  // Errors
  PayrollError,
  NotInitializedError,
  EmployeeNotFoundError,
} from '../src/index.js';

// ============================================================================
// Export Tests
// ============================================================================

describe('Package Exports', () => {
  it('should export main Payroll class', () => {
    expect(Payroll).toBeDefined();
    expect(PayrollBuilder).toBeDefined();
    expect(createPayrollInstance).toBeDefined();
    expect(getPayroll).toBeDefined();
    expect(resetPayroll).toBeDefined();
  });

  it('should export enum constants', () => {
    expect(EMPLOYMENT_TYPE).toBeDefined();
    expect(EMPLOYMENT_TYPE.FULL_TIME).toBe('full_time');
    expect(EMPLOYMENT_TYPE.PART_TIME).toBe('part_time');

    expect(EMPLOYEE_STATUS).toBeDefined();
    expect(EMPLOYEE_STATUS.ACTIVE).toBe('active');
    expect(EMPLOYEE_STATUS.TERMINATED).toBe('terminated');

    expect(DEPARTMENT).toBeDefined();
    expect(PAYROLL_STATUS).toBeDefined();
    expect(PAYMENT_FREQUENCY).toBeDefined();
  });

  it('should export configuration', () => {
    expect(HRM_CONFIG).toBeDefined();
    expect(HRM_CONFIG.payroll.defaultCurrency).toBe('BDT');
    expect(mergeConfig).toBeDefined();
  });

  it('should export utility functions', () => {
    expect(addDays).toBeDefined();
    expect(addMonths).toBeDefined();
    expect(startOfMonth).toBeDefined();
    expect(endOfMonth).toBeDefined();
    expect(diffInDays).toBeDefined();
    expect(sum).toBeDefined();
    expect(sumBy).toBeDefined();
    expect(calculateGross).toBeDefined();
    expect(calculateNet).toBeDefined();
    expect(isActive).toBeDefined();
    expect(isTerminated).toBeDefined();
    expect(canReceiveSalary).toBeDefined();
  });

  it('should export query builders', () => {
    expect(QueryBuilder).toBeDefined();
    expect(EmployeeQueryBuilder).toBeDefined();
    expect(PayrollQueryBuilder).toBeDefined();
    expect(employee).toBeDefined();
    expect(payroll).toBeDefined();
    expect(toObjectId).toBeDefined();
  });

  it('should export error classes', () => {
    expect(PayrollError).toBeDefined();
    expect(NotInitializedError).toBeDefined();
    expect(EmployeeNotFoundError).toBeDefined();
  });
});

// ============================================================================
// Config Tests
// ============================================================================

describe('Configuration', () => {
  it('should have default config values', () => {
    expect(HRM_CONFIG.dataRetention.payrollRecordsTTL).toBe(63072000);
    expect(HRM_CONFIG.payroll.allowProRating).toBe(true);
    expect(HRM_CONFIG.employment.allowReHiring).toBe(true);
  });

  it('should merge custom config', () => {
    const custom = mergeConfig({
      payroll: { defaultCurrency: 'USD' },
    });

    expect(custom.payroll.defaultCurrency).toBe('USD');
    expect(custom.payroll.allowProRating).toBe(true); // Default retained
  });
});

// ============================================================================
// Query Builder Tests
// ============================================================================

describe('Query Builders', () => {
  it('should build basic query', () => {
    const query = new QueryBuilder()
      .where('status', 'active')
      .build();

    expect(query.status).toBe('active');
  });

  it('should build employee query', () => {
    const orgId = new mongoose.Types.ObjectId();
    const query = employee()
      .forOrganization(orgId)
      .withStatus('active')
      .build();

    expect(query.organizationId).toEqual(orgId);
    expect(query.status).toBe('active');
  });

  it('should build payroll query', () => {
    const empId = new mongoose.Types.ObjectId();
    const query = payroll()
      .forEmployee(empId)
      .forPeriod(1, 2025)
      .build();

    expect(query.employeeId).toEqual(empId);
    expect(query['period.month']).toBe(1);
    expect(query['period.year']).toBe(2025);
  });

  it('should convert string to ObjectId', () => {
    const idStr = '507f1f77bcf86cd799439011';
    const id = toObjectId(idStr);
    expect(id.toString()).toBe(idStr);
  });
});

// ============================================================================
// Date Utility Tests
// ============================================================================

describe('Date Utilities', () => {
  it('should add days', () => {
    const date = new Date('2025-01-01');
    const result = addDays(date, 10);
    expect(result.getDate()).toBe(11);
  });

  it('should add months', () => {
    const date = new Date('2025-01-15');
    const result = addMonths(date, 3);
    expect(result.getMonth()).toBe(3); // April
  });

  it('should get start of month', () => {
    const date = new Date('2025-01-15T12:30:00');
    const result = startOfMonth(date);
    expect(result.getDate()).toBe(1);
  });

  it('should get end of month', () => {
    const date = new Date('2025-01-15');
    const result = endOfMonth(date);
    expect(result.getDate()).toBe(31);
  });

  it('should calculate diff in days', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-01-11');
    expect(diffInDays(start, end)).toBe(10);
  });
});

// ============================================================================
// Calculation Utility Tests
// ============================================================================

describe('Calculation Utilities', () => {
  it('should sum numbers', () => {
    expect(sum([1, 2, 3, 4, 5])).toBe(15);
  });

  it('should sum by property', () => {
    const items = [{ amount: 100 }, { amount: 200 }];
    expect(sumBy(items, (i) => i.amount)).toBe(300);
  });

  it('should calculate gross', () => {
    const allowances = [{ amount: 1000 }, { amount: 500 }];
    expect(calculateGross(50000, allowances)).toBe(51500);
  });

  it('should calculate net', () => {
    const deductions = [{ amount: 5000 }];
    expect(calculateNet(50000, deductions)).toBe(45000);
  });
});

// ============================================================================
// Validation Utility Tests
// ============================================================================

describe('Validation Utilities', () => {
  it('should check active status', () => {
    expect(isActive({ status: 'active' })).toBe(true);
    expect(isActive({ status: 'terminated' })).toBe(false);
  });

  it('should check terminated status', () => {
    expect(isTerminated({ status: 'terminated' })).toBe(true);
    expect(isTerminated({ status: 'active' })).toBe(false);
  });

  it('should check can receive salary', () => {
    expect(canReceiveSalary({ status: 'active', compensation: { baseAmount: 50000 } })).toBe(true);
    expect(canReceiveSalary({ status: 'terminated', compensation: { baseAmount: 50000 } })).toBe(false);
    expect(canReceiveSalary({ status: 'active', compensation: { baseAmount: 0 } })).toBe(false);
  });
});

// ============================================================================
// Error Tests
// ============================================================================

describe('Errors', () => {
  it('should create PayrollError', () => {
    const error = new PayrollError('Test error', 'TEST_ERROR');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('PayrollError');
  });

  it('should create NotInitializedError', () => {
    const error = new NotInitializedError();
    expect(error.message).toContain('not initialized');
    expect(error.code).toBe('NOT_INITIALIZED');
  });

  it('should create EmployeeNotFoundError', () => {
    const error = new EmployeeNotFoundError('EMP-001');
    expect(error.message).toContain('EMP-001');
    expect(error.code).toBe('EMPLOYEE_NOT_FOUND');
  });
});

// ============================================================================
// Payroll Class Tests
// ============================================================================

describe('Payroll Class', () => {
  it('should create instance', () => {
    const p = new Payroll();
    expect(p).toBeInstanceOf(Payroll);
    expect(p.isInitialized()).toBe(false);
  });

  it('should throw when not initialized', async () => {
    const p = new Payroll();
    await expect(p.hire({
      userId: new mongoose.Types.ObjectId(),
      organizationId: new mongoose.Types.ObjectId(),
      employment: { position: 'Test', department: 'Engineering' },
      compensation: { baseAmount: 50000 },
    })).rejects.toThrow(NotInitializedError);
  });

  it('should create builder', () => {
    const builder = createPayrollInstance();
    expect(builder).toBeInstanceOf(PayrollBuilder);
  });
});

