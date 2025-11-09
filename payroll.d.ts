/**
 * Type declarations for @classytic/payroll
 * This provides IntelliSense support for the HRM library
 */

declare module '@classytic/payroll' {
    import { Model, Document } from 'mongoose';
  
    // Initialization
    export function initializeHRM(config: {
      EmployeeModel: Model<any>;
      PayrollRecordModel: Model<any>;
      TransactionModel: Model<any>;
      AttendanceModel?: Model<any> | null;
      logger?: any;
    }): void;
  
    export function isInitialized(): boolean;
    export function setLogger(logger: any): void;
  
    // Models
    export const PayrollRecord: Model<any>;
  
    // Orchestrator
    export const hrm: any;
    export const hrmOrchestrator: any;
  
    // Enums
    export const EMPLOYMENT_TYPE: Record<string, string>;
    export const EMPLOYMENT_TYPE_VALUES: string[];
    export const EMPLOYEE_STATUS: Record<string, string>;
    export const EMPLOYEE_STATUS_VALUES: string[];
    export const DEPARTMENT: Record<string, string>;
    export const DEPARTMENT_VALUES: string[];
    export const PAYMENT_FREQUENCY: Record<string, string>;
    export const PAYMENT_FREQUENCY_VALUES: string[];
    export const PAYMENT_METHOD: Record<string, string>;
    export const PAYMENT_METHOD_VALUES: string[];
    export const ALLOWANCE_TYPE: Record<string, string>;
    export const ALLOWANCE_TYPE_VALUES: string[];
    export const DEDUCTION_TYPE: Record<string, string>;
    export const DEDUCTION_TYPE_VALUES: string[];
    export const PAYROLL_STATUS: Record<string, string>;
    export const PAYROLL_STATUS_VALUES: string[];
    export const TERMINATION_REASON: Record<string, string>;
    export const TERMINATION_REASON_VALUES: string[];
    export const HRM_TRANSACTION_CATEGORIES: Record<string, string>;
    export const HRM_CATEGORY_VALUES: string[];
    export function isHRMManagedCategory(category: string): boolean;
  
    // Config
    export const HRM_CONFIG: any;
    export const SALARY_BANDS: any;
    export const TAX_BRACKETS: any;
    export const ORG_ROLES: Record<string, string>;
    export const ORG_ROLE_KEYS: string[];
    export const ROLE_MAPPING: Record<string, any>;
    export function calculateTax(income: number): number;
    export function getSalaryBand(salary: number): any;
    export function determineOrgRole(role: string): string;
  
    // Schemas
    export const employmentFields: Record<string, any>;
    export const allowanceSchema: any;
    export const deductionSchema: any;
    export const compensationSchema: any;
    export const workScheduleSchema: any;
    export const bankDetailsSchema: any;
    export const employmentHistorySchema: any;
    export const payrollStatsSchema: any;
  
    // Plugins
    export function employeePlugin(schema: any, options?: any): void;
  
    // Utilities
    export function addDays(date: Date, days: number): Date;
    export function addMonths(date: Date, months: number): Date;
    export function diffInDays(date1: Date, date2: Date): number;
    export function diffInMonths(date1: Date, date2: Date): number;
    export function startOfMonth(date: Date): Date;
    export function endOfMonth(date: Date): Date;
    export function startOfYear(date: Date): Date;
    export function endOfYear(date: Date): Date;
    export function isWeekday(date: Date): boolean;
    export function isWeekend(date: Date): boolean;
    export function getPayPeriod(date: Date, frequency: string): any;
    export function getCurrentPeriod(frequency: string): any;
    export function calculateProbationEnd(startDate: Date, months: number): Date;
    export function formatDateForDB(date: Date): string;
    export function parseDBDate(dateString: string): Date;
  
    // Calculation utilities
    export function sum(...numbers: number[]): number;
    export function sumBy<T>(array: T[], iteratee: (item: T) => number): number;
    export function sumAllowances(allowances: any[]): number;
    export function sumDeductions(deductions: any[]): number;
    export function calculateGross(baseSalary: number, allowances: any[]): number;
    export function calculateNet(gross: number, deductions: any[]): number;
    export function applyPercentage(amount: number, percentage: number): number;
    export function calculatePercentage(part: number, total: number): number;
    export function createAllowanceCalculator(config: any): (salary: number) => number;
    export function createDeductionCalculator(config: any): (salary: number) => number;
    export function calculateTotalCompensation(compensation: any): number;
    export function pipe(...fns: Function[]): Function;
    export function compose(...fns: Function[]): Function;
  
    // Validation utilities
    export function isActive(employee: any): boolean;
    export function isOnLeave(employee: any): boolean;
    export function isSuspended(employee: any): boolean;
    export function isTerminated(employee: any): boolean;
    export function isEmployed(employee: any): boolean;
    export function canReceiveSalary(employee: any): boolean;
    export function hasCompensation(employee: any): boolean;
    export function required(value: any): boolean;
    export function minValue(min: number): (value: number) => boolean;
    export function maxValue(max: number): (value: number) => boolean;
    export function isInRange(min: number, max: number): (value: number) => boolean;
    export function isPositive(value: number): boolean;
    export function isValidStatus(status: string): boolean;
    export function isValidEmploymentType(type: string): boolean;
    export function composeValidators(...validators: Function[]): Function;
  
    // Query Builders
    export class QueryBuilder {
      where(conditions: any): this;
      select(fields: string | string[]): this;
      populate(paths: string | any[]): this;
      sort(sort: any): this;
      limit(limit: number): this;
      skip(skip: number): this;
      lean(lean?: boolean): this;
      exec(): Promise<any>;
    }
  
    export class EmployeeQueryBuilder extends QueryBuilder {
      byOrganization(organizationId: string): this;
      byStatus(status: string): this;
      byDepartment(department: string): this;
      active(): this;
      terminated(): this;
    }
  
    export class PayrollQueryBuilder extends QueryBuilder {
      byEmployee(employeeId: string): this;
      byPeriod(year: number, month: number): this;
      byStatus(status: string): this;
      pending(): this;
      processed(): this;
    }
  
    export function employee(model: Model<any>): EmployeeQueryBuilder;
    export function payroll(model: Model<any>): PayrollQueryBuilder;
    export function toObjectId(id: string): any;
  
    // Factories
    export class EmployeeFactory {
      static create(data: any): any;
    }
  
    export class EmployeeBuilder {
      setBasicInfo(info: any): this;
      setEmployment(employment: any): this;
      setCompensation(compensation: any): this;
      build(): any;
    }
  
    export function createEmployee(data: any): any;
  
    export class PayrollFactory {
      static create(data: any): any;
    }
  
    export class PayrollBuilder {
      setEmployee(employeeId: string): this;
      setPeriod(year: number, month: number): this;
      setEarnings(earnings: any): this;
      setDeductions(deductions: any): this;
      build(): any;
    }
  
    export class BatchPayrollFactory {
      static createBatch(employees: any[], period: any): any[];
    }
  
    export function createPayroll(data: any): any;
  
    export class CompensationFactory {
      static create(data: any): any;
    }
  
    export class CompensationBuilder {
      setBaseSalary(amount: number): this;
      addAllowance(allowance: any): this;
      addDeduction(deduction: any): this;
      build(): any;
    }
  
    export const CompensationPresets: {
      junior: (baseSalary: number) => any;
      mid: (baseSalary: number) => any;
      senior: (baseSalary: number) => any;
      manager: (baseSalary: number) => any;
    };
  
    export function createCompensation(data: any): any;
  
    // Services
    export class EmployeeService {
      constructor(model: Model<any>);
      findById(id: string): Promise<any>;
      findByOrganization(organizationId: string): Promise<any[]>;
      create(data: any): Promise<any>;
      update(id: string, data: any): Promise<any>;
      delete(id: string): Promise<void>;
    }
  
    export function createEmployeeService(model: Model<any>): EmployeeService;
  
    export class PayrollService {
      constructor(payrollModel: Model<any>, employeeModel: Model<any>);
      processPayroll(employeeId: string, period: any): Promise<any>;
      findByPeriod(organizationId: string, year: number, month: number): Promise<any[]>;
    }
  
    export function createPayrollService(
      payrollModel: Model<any>,
      employeeModel: Model<any>
    ): PayrollService;
  
    export class CompensationService {
      constructor(employeeModel: Model<any>);
      updateCompensation(employeeId: string, compensation: any): Promise<any>;
      getCompensationHistory(employeeId: string): Promise<any[]>;
    }
  
    export function createCompensationService(model: Model<any>): CompensationService;
  
    export default hrm;
  }
  