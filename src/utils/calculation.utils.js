/**
 * Calculation Utilities - Pure, Functional, Composable
 * Beautiful financial calculations without side effects
 */

export const sum = (items, key) =>
  items.reduce((total, item) => total + (key ? item[key] : item), 0);

export const sumBy = (key) => (items) => sum(items, key);

export const sumAllowances = sumBy('amount');

export const sumDeductions = sumBy('amount');

export const calculateGross = (base, allowances) =>
  base + sumAllowances(allowances);

export const calculateNet = (gross, deductions) =>
  gross - sumDeductions(deductions);

export const calculateTotalCompensation = (base, allowances, deductions) => {
  const gross = calculateGross(base, allowances);
  const net = calculateNet(gross, deductions);
  return { gross, net, deductions: sumDeductions(deductions) };
};

export const applyTaxBracket = (amount, brackets) => {
  let tax = 0;
  let remaining = amount;

  for (const bracket of brackets) {
    if (remaining <= 0) break;

    const taxableInBracket = bracket.limit
      ? Math.min(remaining, bracket.limit - (bracket.from || 0))
      : remaining;

    tax += taxableInBracket * bracket.rate;
    remaining -= taxableInBracket;
  }

  return tax;
};

export const calculateTax = (amount, brackets) => ({
  gross: amount,
  tax: applyTaxBracket(amount, brackets),
  net: amount - applyTaxBracket(amount, brackets),
});

export const proRateAmount = (amount, workedDays, totalDays) =>
  Math.round((amount * workedDays) / totalDays);

export const calculatePercentage = (value, total) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

export const applyPercentage = (amount, percentage) =>
  Math.round(amount * (percentage / 100));

export const composeDeductions = (...deductionFns) => (amount) =>
  deductionFns.reduce((remaining, fn) => fn(remaining), amount);

export const composeSalaryPipeline = (base, operations) =>
  operations.reduce((acc, operation) => operation(acc), { base, total: base });

export const createAllowanceCalculator = (allowances) => (base) =>
  allowances.map((a) => ({
    ...a,
    amount: a.isPercentage ? applyPercentage(base, a.value) : a.value,
  }));

export const createDeductionCalculator = (deductions) => (gross) =>
  deductions.map((d) => ({
    ...d,
    amount: d.isPercentage ? applyPercentage(gross, d.value) : d.value,
  }));

/**
 * Functional Composition Utilities
 * Build complex operations from simple functions
 */

// Pipe: Left-to-right function composition
// pipe(f, g, h)(x) === h(g(f(x)))
export const pipe = (...fns) => (value) =>
  fns.reduce((acc, fn) => fn(acc), value);

// Compose: Right-to-left function composition
// compose(f, g, h)(x) === f(g(h(x)))
export const compose = (...fns) => (value) =>
  fns.reduceRight((acc, fn) => fn(acc), value);
