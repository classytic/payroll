/**
 * @classytic/payroll - Secure Employee Lookup
 *
 * Multi-tenant safe employee lookup utilities
 * Enforces organizationId isolation on all queries
 */

import type { Model } from 'mongoose';
import type { EmployeeDocument, ObjectIdLike } from '../types.js';
import { toObjectId, isValidObjectId } from './query-builders.js';
import { EmployeeNotFoundError } from '../errors/index.js';

/**
 * Employee ID mode for explicit disambiguation
 *
 * Controls how the employeeId parameter is interpreted:
 * - 'auto': Auto-detect via isValidObjectId() (default)
 * - 'objectId': Force treat as MongoDB _id (ObjectId)
 * - 'businessId': Force treat as business employeeId string
 *
 * @since v2.3.0
 */
export type EmployeeIdMode = 'auto' | 'objectId' | 'businessId';

/**
 * Lookup options for secure employee queries
 */
export interface SecureEmployeeLookupOptions {
  /**
   * Organization ID (required for multi-tenant isolation)
   * Can be omitted only in single-tenant mode with auto-inject
   */
  organizationId?: ObjectIdLike;

  /**
   * Employee's Mongoose _id (ObjectId)
   * Use this when you have the database ID
   * Takes priority over employeeId if both are provided
   */
  _id?: ObjectIdLike;

  /**
   * Employee identifier (supports both formats):
   * - ObjectId: employee._id (MongoDB document ID)
   * - String: "EMP-001" (business identifier)
   *
   * System auto-detects type by default:
   * - If valid ObjectId → queries by _id field
   * - If string → queries by employeeId field
   *
   * Use employeeIdType to override auto-detection if your business
   * employeeIds look like ObjectIds (24 hex characters).
   *
   * Note: If _id parameter is also provided, _id takes priority
   */
  employeeId?: ObjectIdLike | string;

  /**
   * Explicit mode hint for employeeId disambiguation
   *
   * - 'auto' (default): Auto-detect via isValidObjectId()
   * - 'objectId': Force treat as MongoDB _id (ObjectId)
   * - 'businessId': Force treat as business employeeId string
   *
   * Use 'businessId' if your employeeIds are 24-hex strings like
   * "507f1f77bcf86cd799439011" to prevent ObjectId collision.
   *
   * @default 'auto'
   * @since v2.3.0
   */
  employeeIdMode?: EmployeeIdMode;

  /**
   * User ID reference (optional)
   */
  userId?: ObjectIdLike;

  /**
   * Email address (optional)
   */
  email?: string;

  /**
   * Mongoose session for transactions
   */
  session?: any;

  /**
   * Fields to populate
   */
  populate?: string | string[];
}

/**
 * Securely find an employee by various identifiers
 * ALWAYS enforces organizationId for multi-tenant isolation
 *
 * @param model - Employee model
 * @param options - Lookup options
 * @returns Employee document or throws EmployeeNotFoundError
 *
 * @example
 * // By ObjectId _id
 * const emp = await findEmployeeSecure(Employee, {
 *   _id: employee._id,
 *   organizationId: org._id
 * });
 *
 * @example
 * // By string employeeId
 * const emp = await findEmployeeSecure(Employee, {
 *   employeeId: "EMP-001",
 *   organizationId: org._id
 * });
 *
 * @example
 * // By 24-hex business employeeId (force businessId mode)
 * const emp = await findEmployeeSecure(Employee, {
 *   employeeId: "507f1f77bcf86cd799439011",  // Looks like ObjectId!
 *   employeeIdMode: 'businessId',            // Force treat as business ID
 *   organizationId: org._id
 * });
 *
 * @example
 * // By userId
 * const emp = await findEmployeeSecure(Employee, {
 *   userId: user._id,
 *   organizationId: org._id
 * });
 */
export async function findEmployeeSecure<T extends EmployeeDocument>(
  model: Model<T>,
  options: SecureEmployeeLookupOptions
): Promise<T> {
  const {
    organizationId,
    _id,
    employeeId,
    employeeIdMode = 'auto',
    userId,
    email,
    session,
    populate,
  } = options;

  // Build query with organizationId isolation
  const query: Record<string, any> = {};

  // CRITICAL: Always include organizationId for multi-tenant safety
  if (organizationId) {
    query.organizationId = toObjectId(organizationId);
  }

  // Add identifier filters (priority: _id > employeeId > userId > email)
  if (_id) {
    query._id = toObjectId(_id);
  } else if (employeeId !== undefined) {
    // Resolve employeeId mode based on explicit hint or auto-detection
    const shouldTreatAsObjectId =
      employeeIdMode === 'objectId' ||
      (employeeIdMode === 'auto' && isValidObjectId(employeeId));

    const shouldTreatAsBusinessId =
      employeeIdMode === 'businessId' ||
      (employeeIdMode === 'auto' && !isValidObjectId(employeeId));

    if (shouldTreatAsObjectId) {
      // It's an ObjectId → query by _id field
      query._id = toObjectId(employeeId as ObjectIdLike);
    } else if (shouldTreatAsBusinessId) {
      // It's a string business identifier → query by employeeId field
      query.employeeId = employeeId as string;
    }
  } else if (userId) {
    query.userId = toObjectId(userId);
  } else if (email) {
    query.email = email;
  } else {
    throw new Error(
      'findEmployeeSecure requires at least one identifier: _id, employeeId, userId, or email'
    );
  }

  // Build Mongoose query
  let mongooseQuery = model.findOne(query);

  if (session) {
    mongooseQuery = mongooseQuery.session(session);
  }

  if (populate) {
    const fields = Array.isArray(populate) ? populate : [populate];
    for (const field of fields) {
      mongooseQuery = mongooseQuery.populate(field);
    }
  }

  const employee = await mongooseQuery;

  if (!employee) {
    // Provide helpful error message
    const identifier = _id
      ? `_id=${_id}`
      : employeeId
      ? `employeeId=${employeeId}`
      : userId
      ? `userId=${userId}`
      : `email=${email}`;

    throw new EmployeeNotFoundError(
      `Employee not found: ${identifier}${organizationId ? ` in organization ${organizationId}` : ''}`
    );
  }

  return employee;
}

/**
 * Check if an employee exists securely (with org isolation)
 *
 * @param model - Employee model
 * @param options - Lookup options
 * @returns true if employee exists, false otherwise
 */
export async function employeeExistsSecure<T extends EmployeeDocument>(
  model: Model<T>,
  options: SecureEmployeeLookupOptions
): Promise<boolean> {
  try {
    await findEmployeeSecure(model, options);
    return true;
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) {
      return false;
    }
    throw error;
  }
}

/**
 * Find multiple employees securely (with org isolation)
 *
 * @param model - Employee model
 * @param options - Query options
 * @returns Array of employee documents
 */
export async function findEmployeesSecure<T extends EmployeeDocument>(
  model: Model<T>,
  options: {
    organizationId: ObjectIdLike;
    filter?: Record<string, any>;
    session?: any;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }
): Promise<T[]> {
  const { organizationId, filter = {}, session, limit, skip, sort } = options;

  // CRITICAL: Always include organizationId
  const query = {
    organizationId: toObjectId(organizationId),
    ...filter,
  };

  let mongooseQuery = model.find(query);

  if (session) {
    mongooseQuery = mongooseQuery.session(session);
  }

  if (limit) {
    mongooseQuery = mongooseQuery.limit(limit);
  }

  if (skip) {
    mongooseQuery = mongooseQuery.skip(skip);
  }

  if (sort) {
    mongooseQuery = mongooseQuery.sort(sort);
  }

  return mongooseQuery;
}

/**
 * Validate organizationId is provided (unless single-tenant with auto-inject)
 *
 * @param organizationId - Organization ID to validate
 * @param operation - Operation name for error message
 * @throws Error if organizationId is missing
 */
export function requireOrganizationId(
  organizationId: ObjectIdLike | undefined,
  operation: string
): void {
  if (!organizationId) {
    throw new Error(
      `${operation} requires organizationId. ` +
        'In multi-tenant mode, you must explicitly provide organizationId. ' +
        'In single-tenant mode, ensure autoInject is enabled in configuration.'
    );
  }
}
