/**
 * Query Builders - Fluent API, Type-Safe, Beautiful
 * Inspired by Angular's RxJS and Playwright's chaining
 */

import mongoose from 'mongoose';

export const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);

export class QueryBuilder {
  constructor(initialQuery = {}) {
    this.query = { ...initialQuery };
  }

  where(field, value) {
    this.query[field] = value;
    return this;
  }

  whereIn(field, values) {
    this.query[field] = { $in: values };
    return this;
  }

  whereNotIn(field, values) {
    this.query[field] = { $nin: values };
    return this;
  }

  whereGte(field, value) {
    this.query[field] = { ...this.query[field], $gte: value };
    return this;
  }

  whereLte(field, value) {
    this.query[field] = { ...this.query[field], $lte: value };
    return this;
  }

  whereBetween(field, start, end) {
    this.query[field] = { $gte: start, $lte: end };
    return this;
  }

  whereExists(field) {
    this.query[field] = { $exists: true };
    return this;
  }

  whereNotExists(field) {
    this.query[field] = { $exists: false };
    return this;
  }

  build() {
    return this.query;
  }
}

export const createQueryBuilder = (initialQuery) => new QueryBuilder(initialQuery);

export class EmployeeQueryBuilder extends QueryBuilder {
  forOrganization(organizationId) {
    return this.where('organizationId', toObjectId(organizationId));
  }

  forUser(userId) {
    return this.where('userId', toObjectId(userId));
  }

  withStatus(...statuses) {
    return statuses.length === 1
      ? this.where('status', statuses[0])
      : this.whereIn('status', statuses);
  }

  active() {
    return this.withStatus('active');
  }

  employed() {
    return this.whereIn('status', ['active', 'on_leave', 'suspended']);
  }

  inDepartment(department) {
    return this.where('department', department);
  }

  inPosition(position) {
    return this.where('position', position);
  }

  withEmploymentType(type) {
    return this.where('employmentType', type);
  }

  hiredAfter(date) {
    return this.whereGte('hireDate', date);
  }

  hiredBefore(date) {
    return this.whereLte('hireDate', date);
  }
}

export class PayrollQueryBuilder extends QueryBuilder {
  forOrganization(organizationId) {
    return this.where('organizationId', toObjectId(organizationId));
  }

  forEmployee(employeeId) {
    return this.where('employeeId', toObjectId(employeeId));
  }

  forPeriod(month, year) {
    if (month) this.where('period.month', month);
    if (year) this.where('period.year', year);
    return this;
  }

  withStatus(...statuses) {
    return statuses.length === 1
      ? this.where('status', statuses[0])
      : this.whereIn('status', statuses);
  }

  paid() {
    return this.withStatus('paid');
  }

  pending() {
    return this.withStatus('pending', 'processing');
  }

  inDateRange(start, end) {
    return this.whereBetween('paymentDate', start, end);
  }
}

export const employee = () => new EmployeeQueryBuilder();
export const payroll = () => new PayrollQueryBuilder();

export const buildEmployeeQuery = ({ organizationId, userId, statuses }) => {
  const builder = employee().forOrganization(organizationId);

  if (userId) builder.forUser(userId);
  if (statuses) builder.withStatus(...statuses);

  return builder.build();
};

export const buildPayrollQuery = ({ employeeId, period, statuses }) => {
  const builder = payroll().forEmployee(employeeId);

  if (period) builder.forPeriod(period.month, period.year);
  if (statuses) builder.withStatus(...statuses);

  return builder.build();
};

export const buildAggregationPipeline = (...stages) => stages.filter(Boolean);

export const matchStage = (query) => ({ $match: query });

export const groupStage = (groupBy, aggregations) => ({
  $group: {
    _id: groupBy,
    ...aggregations,
  },
});

export const sortStage = (sortBy) => ({ $sort: sortBy });

export const limitStage = (limit) => ({ $limit: limit });

export const projectStage = (fields) => ({ $project: fields });

export const lookupStage = ({ from, localField, foreignField, as }) => ({
  $lookup: { from, localField, foreignField, as },
});

export const unwindStage = (path, options = {}) => ({
  $unwind: { path, ...options },
});
