/**
 * Validation Utilities - Fluent, Composable, Type-Safe
 * Beautiful validation with clear semantics
 */

export const isActive = (employee) =>
  employee?.status === 'active';

export const isOnLeave = (employee) =>
  employee?.status === 'on_leave';

export const isSuspended = (employee) =>
  employee?.status === 'suspended';

export const isTerminated = (employee) =>
  employee?.status === 'terminated';

export const isEmployed = (employee) =>
  isActive(employee) || isOnLeave(employee) || isSuspended(employee);

export const canReceiveSalary = (employee) =>
  isActive(employee) || isOnLeave(employee);

export const canUpdateEmployment = (employee) =>
  !isTerminated(employee);

export const isInProbation = (employee, now = new Date()) =>
  employee?.probationEndDate && new Date(employee.probationEndDate) > now;

export const hasCompletedProbation = (employee, now = new Date()) =>
  employee?.probationEndDate && new Date(employee.probationEndDate) <= now;

export const hasCompensation = (employee) =>
  employee?.compensation?.baseAmount > 0;

export const isEligibleForBonus = (employee, requiredMonths = 6) => {
  if (!isActive(employee)) return false;
  const monthsEmployed = monthsBetween(employee.hireDate, new Date());
  return monthsEmployed >= requiredMonths;
};

export const isValidCompensation = (compensation) =>
  compensation?.baseAmount > 0 &&
  compensation?.frequency &&
  compensation?.currency;

export const isValidBankDetails = (bankDetails) =>
  bankDetails?.accountNumber &&
  bankDetails?.bankName &&
  bankDetails?.accountHolderName;

export const hasRequiredFields = (obj, fields) =>
  fields.every((field) => obj?.[field] !== undefined && obj?.[field] !== null);

export const createValidator = (validationFns) => (data) => {
  const errors = [];

  for (const [field, validator] of Object.entries(validationFns)) {
    const result = validator(data[field], data);
    if (result !== true) {
      errors.push({ field, message: result });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const required = (fieldName) => (value) =>
  value !== undefined && value !== null && value !== ''
    ? true
    : `${fieldName} is required`;

export const min = (minValue, fieldName) => (value) =>
  value >= minValue ? true : `${fieldName} must be at least ${minValue}`;

export const max = (maxValue, fieldName) => (value) =>
  value <= maxValue ? true : `${fieldName} must not exceed ${maxValue}`;

export const inRange = (minValue, maxValue, fieldName) => (value) =>
  value >= minValue && value <= maxValue
    ? true
    : `${fieldName} must be between ${minValue} and ${maxValue}`;

export const oneOf = (allowedValues, fieldName) => (value) =>
  allowedValues.includes(value)
    ? true
    : `${fieldName} must be one of: ${allowedValues.join(', ')}`;

export const compose = (...validators) => (value, data) => {
  for (const validator of validators) {
    const result = validator(value, data);
    if (result !== true) return result;
  }
  return true;
};

// Additional validators
export const isPositive = (fieldName) => (value) =>
  value > 0 ? true : `${fieldName} must be positive`;

export const isValidStatus = (value) =>
  ['active', 'on_leave', 'suspended', 'terminated'].includes(value);

export const isValidEmploymentType = (value) =>
  ['full_time', 'part_time', 'contract', 'internship'].includes(value);

// Aliases for consistency
export const minValue = min;
export const maxValue = max;
export const isInRange = inRange;

const monthsBetween = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return (
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth())
  );
};
