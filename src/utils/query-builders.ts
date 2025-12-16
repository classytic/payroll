/**
 * @classytic/payroll - Query Builders
 *
 * Fluent API for building MongoDB queries
 * Type-safe, chainable, beautiful
 */

import mongoose, { Types } from 'mongoose';
import type {
  ObjectIdLike,
  EmployeeStatus,
  PayrollStatus,
  Department,
  EmploymentType,
} from '../types.js';

// ============================================================================
// ObjectId Helpers
// ============================================================================

/**
 * Convert string or ObjectId to ObjectId
 */
export function toObjectId(id: ObjectIdLike): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  return new Types.ObjectId(id);
}

/**
 * Safely convert to ObjectId (returns null if invalid)
 */
export function safeToObjectId(id: unknown): Types.ObjectId | null {
  if (id instanceof Types.ObjectId) return id;
  if (typeof id === 'string' && Types.ObjectId.isValid(id)) {
    return new Types.ObjectId(id);
  }
  return null;
}

/**
 * Check if value is valid ObjectId
 */
export function isValidObjectId(value: unknown): boolean {
  if (value instanceof Types.ObjectId) return true;
  if (typeof value === 'string') return Types.ObjectId.isValid(value);
  return false;
}

// ============================================================================
// Base Query Builder
// ============================================================================

export class QueryBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  protected query: T;

  constructor(initialQuery: T = {} as T) {
    this.query = { ...initialQuery };
  }

  /**
   * Add where condition
   */
  where<K extends string>(field: K, value: unknown): this {
    (this.query as Record<string, unknown>)[field] = value;
    return this;
  }

  /**
   * Add $in condition
   */
  whereIn<K extends string>(field: K, values: unknown[]): this {
    (this.query as Record<string, unknown>)[field] = { $in: values };
    return this;
  }

  /**
   * Add $nin condition
   */
  whereNotIn<K extends string>(field: K, values: unknown[]): this {
    (this.query as Record<string, unknown>)[field] = { $nin: values };
    return this;
  }

  /**
   * Add $gte condition
   */
  whereGte<K extends string>(field: K, value: unknown): this {
    const existing = (this.query as Record<string, Record<string, unknown>>)[field] || {};
    (this.query as Record<string, unknown>)[field] = { ...existing, $gte: value };
    return this;
  }

  /**
   * Add $lte condition
   */
  whereLte<K extends string>(field: K, value: unknown): this {
    const existing = (this.query as Record<string, Record<string, unknown>>)[field] || {};
    (this.query as Record<string, unknown>)[field] = { ...existing, $lte: value };
    return this;
  }

  /**
   * Add $gt condition
   */
  whereGt<K extends string>(field: K, value: unknown): this {
    const existing = (this.query as Record<string, Record<string, unknown>>)[field] || {};
    (this.query as Record<string, unknown>)[field] = { ...existing, $gt: value };
    return this;
  }

  /**
   * Add $lt condition
   */
  whereLt<K extends string>(field: K, value: unknown): this {
    const existing = (this.query as Record<string, Record<string, unknown>>)[field] || {};
    (this.query as Record<string, unknown>)[field] = { ...existing, $lt: value };
    return this;
  }

  /**
   * Add between condition
   */
  whereBetween<K extends string>(field: K, start: unknown, end: unknown): this {
    (this.query as Record<string, unknown>)[field] = { $gte: start, $lte: end };
    return this;
  }

  /**
   * Add $exists condition
   */
  whereExists<K extends string>(field: K): this {
    (this.query as Record<string, unknown>)[field] = { $exists: true };
    return this;
  }

  /**
   * Add $exists: false condition
   */
  whereNotExists<K extends string>(field: K): this {
    (this.query as Record<string, unknown>)[field] = { $exists: false };
    return this;
  }

  /**
   * Add $ne condition
   */
  whereNot<K extends string>(field: K, value: unknown): this {
    (this.query as Record<string, unknown>)[field] = { $ne: value };
    return this;
  }

  /**
   * Add regex condition
   */
  whereRegex<K extends string>(field: K, pattern: string, flags = 'i'): this {
    (this.query as Record<string, unknown>)[field] = { $regex: pattern, $options: flags };
    return this;
  }

  /**
   * Merge another query
   */
  merge(otherQuery: Record<string, unknown>): this {
    this.query = { ...this.query, ...otherQuery } as T;
    return this;
  }

  /**
   * Build and return the query
   */
  build(): T {
    return { ...this.query };
  }
}

// ============================================================================
// Employee Query Builder
// ============================================================================

export class EmployeeQueryBuilder extends QueryBuilder {
  /**
   * Filter by organization
   */
  forOrganization(organizationId: ObjectIdLike): this {
    return this.where('organizationId', toObjectId(organizationId));
  }

  /**
   * Filter by user
   */
  forUser(userId: ObjectIdLike): this {
    return this.where('userId', toObjectId(userId));
  }

  /**
   * Filter by status(es)
   */
  withStatus(...statuses: EmployeeStatus[]): this {
    if (statuses.length === 1) {
      return this.where('status', statuses[0]);
    }
    return this.whereIn('status', statuses);
  }

  /**
   * Filter active employees
   */
  active(): this {
    return this.withStatus('active');
  }

  /**
   * Filter employed employees (not terminated)
   */
  employed(): this {
    return this.whereIn('status', ['active', 'on_leave', 'suspended']);
  }

  /**
   * Filter terminated employees
   */
  terminated(): this {
    return this.withStatus('terminated');
  }

  /**
   * Filter by department
   */
  inDepartment(department: Department | string): this {
    return this.where('department', department);
  }

  /**
   * Filter by position
   */
  inPosition(position: string): this {
    return this.where('position', position);
  }

  /**
   * Filter by employment type
   */
  withEmploymentType(type: EmploymentType | string): this {
    return this.where('employmentType', type);
  }

  /**
   * Filter by hire date (after)
   */
  hiredAfter(date: Date): this {
    return this.whereGte('hireDate', date);
  }

  /**
   * Filter by hire date (before)
   */
  hiredBefore(date: Date): this {
    return this.whereLte('hireDate', date);
  }

  /**
   * Filter by minimum salary
   */
  withMinSalary(amount: number): this {
    return this.whereGte('compensation.netSalary', amount);
  }

  /**
   * Filter by maximum salary
   */
  withMaxSalary(amount: number): this {
    return this.whereLte('compensation.netSalary', amount);
  }

  /**
   * Filter by salary range
   */
  withSalaryRange(min: number, max: number): this {
    return this.whereBetween('compensation.netSalary', min, max);
  }
}

// ============================================================================
// Payroll Query Builder
// ============================================================================

export class PayrollQueryBuilder extends QueryBuilder {
  /**
   * Filter by organization
   */
  forOrganization(organizationId: ObjectIdLike): this {
    return this.where('organizationId', toObjectId(organizationId));
  }

  /**
   * Filter by employee
   */
  forEmployee(employeeId: ObjectIdLike): this {
    return this.where('employeeId', toObjectId(employeeId));
  }

  /**
   * Filter by period
   */
  forPeriod(month?: number, year?: number): this {
    if (month !== undefined) {
      this.where('period.month', month);
    }
    if (year !== undefined) {
      this.where('period.year', year);
    }
    return this;
  }

  /**
   * Filter by status(es)
   */
  withStatus(...statuses: PayrollStatus[]): this {
    if (statuses.length === 1) {
      return this.where('status', statuses[0]);
    }
    return this.whereIn('status', statuses);
  }

  /**
   * Filter paid records
   */
  paid(): this {
    return this.withStatus('paid');
  }

  /**
   * Filter pending records
   */
  pending(): this {
    return this.whereIn('status', ['pending', 'processing']);
  }

  /**
   * Filter by date range
   */
  inDateRange(start: Date, end: Date): this {
    return this.whereBetween('period.payDate', start, end);
  }

  /**
   * Filter exported records
   */
  exported(): this {
    return this.where('exported', true);
  }

  /**
   * Filter not exported records
   */
  notExported(): this {
    return this.where('exported', false);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create employee query builder
 */
export function employee(): EmployeeQueryBuilder {
  return new EmployeeQueryBuilder();
}

/**
 * Create payroll query builder
 */
export function payroll(): PayrollQueryBuilder {
  return new PayrollQueryBuilder();
}

/**
 * Create generic query builder
 */
export function createQueryBuilder<T extends Record<string, unknown> = Record<string, unknown>>(
  initialQuery?: T
): QueryBuilder<T> {
  return new QueryBuilder(initialQuery);
}

// ============================================================================
// Convenience Query Builders
// ============================================================================

/**
 * Build employee query from options
 */
export function buildEmployeeQuery(options: {
  organizationId: ObjectIdLike;
  userId?: ObjectIdLike;
  statuses?: EmployeeStatus[];
  department?: Department | string;
  employmentType?: EmploymentType | string;
}): Record<string, unknown> {
  const builder = employee().forOrganization(options.organizationId);

  if (options.userId) {
    builder.forUser(options.userId);
  }
  if (options.statuses) {
    builder.withStatus(...options.statuses);
  }
  if (options.department) {
    builder.inDepartment(options.department);
  }
  if (options.employmentType) {
    builder.withEmploymentType(options.employmentType);
  }

  return builder.build();
}

/**
 * Build payroll query from options
 */
export function buildPayrollQuery(options: {
  employeeId?: ObjectIdLike;
  organizationId?: ObjectIdLike;
  month?: number;
  year?: number;
  statuses?: PayrollStatus[];
}): Record<string, unknown> {
  const builder = payroll();

  if (options.organizationId) {
    builder.forOrganization(options.organizationId);
  }
  if (options.employeeId) {
    builder.forEmployee(options.employeeId);
  }
  if (options.month || options.year) {
    builder.forPeriod(options.month, options.year);
  }
  if (options.statuses) {
    builder.withStatus(...options.statuses);
  }

  return builder.build();
}

// ============================================================================
// Aggregation Pipeline Helpers
// ============================================================================

/**
 * Build aggregation pipeline from stages
 */
export function buildAggregationPipeline(
  ...stages: Array<Record<string, unknown> | undefined | null>
): Record<string, unknown>[] {
  return stages.filter((stage): stage is Record<string, unknown> => !!stage);
}

/**
 * Match stage
 */
export function matchStage(query: Record<string, unknown>): Record<string, unknown> {
  return { $match: query };
}

/**
 * Group stage
 */
export function groupStage(
  groupBy: string | null,
  aggregations: Record<string, unknown>
): Record<string, unknown> {
  return {
    $group: {
      _id: groupBy,
      ...aggregations,
    },
  };
}

/**
 * Sort stage
 */
export function sortStage(sortBy: Record<string, 1 | -1>): Record<string, unknown> {
  return { $sort: sortBy };
}

/**
 * Limit stage
 */
export function limitStage(limit: number): Record<string, unknown> {
  return { $limit: limit };
}

/**
 * Skip stage
 */
export function skipStage(skip: number): Record<string, unknown> {
  return { $skip: skip };
}

/**
 * Project stage
 */
export function projectStage(fields: Record<string, unknown>): Record<string, unknown> {
  return { $project: fields };
}

/**
 * Lookup stage
 */
export function lookupStage(options: {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
}): Record<string, unknown> {
  return { $lookup: options };
}

/**
 * Unwind stage
 */
export function unwindStage(
  path: string,
  options: { preserveNullAndEmptyArrays?: boolean } = {}
): Record<string, unknown> {
  return { $unwind: { path, ...options } };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  toObjectId,
  safeToObjectId,
  isValidObjectId,
  QueryBuilder,
  EmployeeQueryBuilder,
  PayrollQueryBuilder,
  employee,
  payroll,
  createQueryBuilder,
  buildEmployeeQuery,
  buildPayrollQuery,
  buildAggregationPipeline,
  matchStage,
  groupStage,
  sortStage,
  limitStage,
  skipStage,
  projectStage,
  lookupStage,
  unwindStage,
};

