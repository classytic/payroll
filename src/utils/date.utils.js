/**
 * Date Utilities - Pure, Composable, Testable
 * Elegant date operations without side effects
 */

export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const addMonths = (date, months) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

export const addYears = (date, years) => {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
};

export const startOfMonth = (date) => {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const endOfMonth = (date) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1, 0);
  result.setHours(23, 59, 59, 999);
  return result;
};

export const startOfYear = (date) => {
  const result = new Date(date);
  result.setMonth(0, 1);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const endOfYear = (date) => {
  const result = new Date(date);
  result.setMonth(11, 31);
  result.setHours(23, 59, 59, 999);
  return result;
};

export const isWeekday = (date) => {
  const day = new Date(date).getDay();
  return day >= 1 && day <= 5;
};

export const isWeekend = (date) => {
  const day = new Date(date).getDay();
  return day === 0 || day === 6;
};

export const getPayPeriod = (month, year) => {
  const startDate = new Date(year, month - 1, 1);
  return {
    month,
    year,
    startDate: startOfMonth(startDate),
    endDate: endOfMonth(startDate),
  };
};

export const getCurrentPeriod = (date = new Date()) => {
  const d = new Date(date);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
  };
};

export const calculateProbationEnd = (hireDate, probationMonths) =>
  probationMonths ? addMonths(hireDate, probationMonths) : null;

export const formatDateForDB = (date) => {
  if (!date) return null;
  return new Date(date).toISOString();
};

export const parseDBDate = (dateString) => {
  if (!dateString) return null;
  return new Date(dateString);
};

export const diffInDays = (start, end) =>
  Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));

export const diffInMonths = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return (
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth())
  );
};

// Aliases for backwards compatibility
export const daysBetween = diffInDays;
export const monthsBetween = diffInMonths;

export const isDateInRange = (date, start, end) => {
  const checkDate = new Date(date);
  return checkDate >= new Date(start) && checkDate <= new Date(end);
};

export const formatPeriod = ({ month, year }) =>
  `${String(month).padStart(2, '0')}/${year}`;

export const parsePeriod = (periodString) => {
  const [month, year] = periodString.split('/').map(Number);
  return { month, year };
};
