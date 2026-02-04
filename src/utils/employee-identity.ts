/**
 * @classytic/payroll - Employee Identity Helper
 *
 * Dual identity system for employee lookups:
 * - MongoDB ObjectId (_id field)
 * - Business string identifier (employeeId field like "EMP-001")
 *
 * Auto-detects identifier type and builds appropriate queries
 */

import type { ObjectIdLike } from '../types.js';
import { Types } from 'mongoose';
import { isValidObjectId, toObjectId } from './query-builders.js';

/**
 * Employee identifier type
 */
export type EmployeeIdType = 'objectId' | 'string';

/**
 * Employee query filter
 */
export interface EmployeeQueryFilter {
  _id?: Types.ObjectId;
  employeeId?: string;
  organizationId: Types.ObjectId;
}

/**
 * Detect if employeeId is ObjectId or string
 *
 * @param employeeId - Employee identifier (ObjectId or string)
 * @returns 'objectId' if valid ObjectId, 'string' otherwise
 *
 * @example
 * detectEmployeeIdType(employee._id)
 * // Returns: 'objectId'
 *
 * @example
 * detectEmployeeIdType("EMP-001")
 * // Returns: 'string'
 */
export function detectEmployeeIdType(
  employeeId: ObjectIdLike | string
): EmployeeIdType {
  // Check if it's a valid ObjectId
  if (isValidObjectId(employeeId)) {
    return 'objectId';
  }

  // Otherwise treat as string business identifier
  return 'string';
}

// NOTE: buildEmployeeQuery has been removed from this file.
// Use buildEmployeeQuery from query-builders.ts instead, which has a more flexible API.
// The removed function duplicated functionality and was intentionally not exported.

/**
 * Normalize employee identifier to consistent format
 *
 * Converts ObjectIdLike to ObjectId, keeps strings as-is
 *
 * @param employeeId - Employee identifier
 * @returns Normalized ObjectId or string
 */
export function normalizeEmployeeId(
  employeeId: ObjectIdLike | string
): Types.ObjectId | string {
  const idType = detectEmployeeIdType(employeeId);

  if (idType === 'objectId') {
    return toObjectId(employeeId as ObjectIdLike);
  }

  return employeeId as string;
}

/**
 * Check if value is a string employee ID (not ObjectId)
 *
 * @param value - Value to check
 * @returns true if string employeeId, false if ObjectId
 */
export function isStringEmployeeId(value: unknown): value is string {
  return typeof value === 'string' && !isValidObjectId(value);
}

/**
 * Check if value is an ObjectId employee identifier
 *
 * @param value - Value to check
 * @returns true if ObjectId, false otherwise
 */
export function isObjectIdEmployeeId(value: unknown): value is ObjectIdLike {
  return isValidObjectId(value);
}

/**
 * Format employee identifier for display
 *
 * @param employeeId - Employee identifier
 * @returns Human-readable string
 *
 * @example
 * formatEmployeeId(employee._id)
 * // Returns: "_id=507f1f77bcf86cd799439011"
 *
 * @example
 * formatEmployeeId("EMP-001")
 * // Returns: "employeeId=EMP-001"
 */
export function formatEmployeeId(employeeId: ObjectIdLike | string): string {
  const idType = detectEmployeeIdType(employeeId);

  if (idType === 'objectId') {
    return `_id=${toObjectId(employeeId as ObjectIdLike).toString()}`;
  }

  return `employeeId=${employeeId}`;
}
