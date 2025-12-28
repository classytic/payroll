/**
 * @classytic/payroll - Labor Law Compliance Checker
 *
 * Validates employment data against jurisdiction-specific labor laws.
 */

import type {
  JurisdictionIdentifier,
  ComplianceViolation,
  EmploymentData,
} from '../types.js';
import { requireJurisdiction } from '../registry.js';

// ============================================================================
// Compliance Checking
// ============================================================================

/**
 * Check compliance for an employee
 *
 * @example
 * ```typescript
 * const violations = checkCompliance({
 *   baseSalary: 2500,
 *   currency: 'USD',
 *   hoursWorked: 45,
 *   jurisdiction: { country: 'US', state: 'CA' },
 * });
 *
 * if (violations.length > 0) {
 *   console.log('Compliance issues found:', violations);
 * }
 * ```
 */
export function checkCompliance(
  data: EmploymentData,
  jurisdiction: JurisdictionIdentifier
): ComplianceViolation[] {
  const jurisdictionDef = requireJurisdiction(jurisdiction);
  const violations: ComplianceViolation[] = [];

  // 1. Check minimum wage
  violations.push(...checkMinimumWage(data, jurisdictionDef.wage.minimumWage.amount));

  // 2. Check maximum hours
  violations.push(
    ...checkMaximumHours(data, jurisdictionDef.workingHours.maxDailyHours, jurisdictionDef.workingHours.maxWeeklyHours)
  );

  // 3. Check pay frequency
  violations.push(...checkPayFrequency(data, jurisdictionDef.wage.payFrequency));

  // 4. Check leave entitlements
  violations.push(...checkLeaveEntitlements(data, jurisdictionDef.leave));

  // 5. Run custom jurisdiction rules
  for (const rule of jurisdictionDef.complianceRules) {
    violations.push(...rule.validate(data));
  }

  return violations;
}

/**
 * Check multiple employees for compliance
 */
export function checkBulkCompliance(
  employees: Array<EmploymentData & { jurisdiction: JurisdictionIdentifier }>,
  options?: {
    severityFilter?: ComplianceViolation['severity'][];
    categoryFilter?: string[];
  }
): Array<{
  employee: EmploymentData;
  violations: ComplianceViolation[];
}> {
  const results = employees.map((employee) => ({
    employee,
    violations: checkCompliance(employee, employee.jurisdiction),
  }));

  // Filter by severity
  if (options?.severityFilter) {
    results.forEach((result) => {
      result.violations = result.violations.filter((v) =>
        options.severityFilter!.includes(v.severity)
      );
    });
  }

  // Filter by category
  if (options?.categoryFilter) {
    results.forEach((result) => {
      result.violations = result.violations.filter((v) => {
        const rule = v.ruleId.split(':')[0];
        return options.categoryFilter!.includes(rule);
      });
    });
  }

  return results.filter((r) => r.violations.length > 0);
}

// ============================================================================
// Specific Compliance Checks
// ============================================================================

/**
 * Check if salary meets minimum wage
 */
function checkMinimumWage(data: EmploymentData, minimumWage: number): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Calculate hourly wage
  const hoursPerMonth = 160; // Approximate (40 hours/week * 4 weeks)
  const hourlyWage = data.baseSalary / hoursPerMonth;

  if (hourlyWage < minimumWage) {
    violations.push({
      ruleId: 'wage:minimum-wage',
      ruleName: 'Minimum Wage Violation',
      severity: 'critical',
      message: `Hourly wage ${hourlyWage.toFixed(2)} is below minimum wage ${minimumWage.toFixed(2)}`,
      remediation: `Increase base salary to at least ${(minimumWage * hoursPerMonth).toFixed(2)} per month`,
      penalty: (minimumWage * hoursPerMonth - data.baseSalary) * 2, // Double damages
    });
  }

  return violations;
}

/**
 * Check maximum working hours
 */
function checkMaximumHours(
  data: EmploymentData,
  maxDailyHours: number,
  maxWeeklyHours: number
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Daily hours check (if data available)
  if (data.dailyHours && data.dailyHours > maxDailyHours) {
    violations.push({
      ruleId: 'hours:max-daily',
      ruleName: 'Maximum Daily Hours Exceeded',
      severity: 'high',
      message: `Employee worked ${data.dailyHours} hours, exceeding maximum of ${maxDailyHours} hours`,
      remediation: 'Reduce daily hours or obtain special exemption',
    });
  }

  // Weekly hours check
  const weeklyHours = data.hoursWorked || 0;
  if (weeklyHours > maxWeeklyHours) {
    violations.push({
      ruleId: 'hours:max-weekly',
      ruleName: 'Maximum Weekly Hours Exceeded',
      severity: 'high',
      message: `Employee worked ${weeklyHours} hours, exceeding maximum of ${maxWeeklyHours} hours`,
      remediation: 'Ensure proper overtime authorization and rest periods',
    });
  }

  return violations;
}

/**
 * Check pay frequency compliance
 */
function checkPayFrequency(
  data: EmploymentData,
  config: { allowed: string[]; default: string }
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  if (data.payFrequency && !config.allowed.includes(data.payFrequency)) {
    violations.push({
      ruleId: 'wage:pay-frequency',
      ruleName: 'Invalid Pay Frequency',
      severity: 'medium',
      message: `Pay frequency '${data.payFrequency}' is not allowed in this jurisdiction`,
      remediation: `Use one of: ${config.allowed.join(', ')}`,
    });
  }

  return violations;
}

/**
 * Check leave entitlements
 */
function checkLeaveEntitlements(data: EmploymentData, config: any): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Check if leave balance is negative (shouldn't happen)
  if (data.leaveBalance) {
    if (data.leaveBalance.annual < 0) {
      violations.push({
        ruleId: 'leave:negative-balance',
        ruleName: 'Negative Leave Balance',
        severity: 'medium',
        message: 'Employee has negative annual leave balance',
        remediation: 'Review leave usage and accrual calculations',
      });
    }

    if (data.leaveBalance.sick < 0) {
      violations.push({
        ruleId: 'leave:negative-sick-balance',
        ruleName: 'Negative Sick Leave Balance',
        severity: 'low',
        message: 'Employee has negative sick leave balance',
        remediation: 'Review sick leave policy and usage',
      });
    }
  }

  return violations;
}

// ============================================================================
// Compliance Reports
// ============================================================================

/**
 * Generate compliance report for an organization
 */
export function generateComplianceReport(
  employees: Array<EmploymentData & { jurisdiction: JurisdictionIdentifier; id: string; name: string }>,
  options?: {
    includeCompliant?: boolean;
    groupByJurisdiction?: boolean;
  }
): {
  summary: {
    totalEmployees: number;
    compliantEmployees: number;
    violationCount: number;
    criticalViolations: number;
    highViolations: number;
    mediumViolations: number;
    lowViolations: number;
  };
  violations: Array<{
    employeeId: string;
    employeeName: string;
    jurisdiction: string;
    violations: ComplianceViolation[];
  }>;
  byJurisdiction?: Map<
    string,
    {
      employeeCount: number;
      violationCount: number;
      violations: ComplianceViolation[];
    }
  >;
} {
  const results = checkBulkCompliance(employees);

  // Calculate summary
  const allViolations = results.flatMap((r) => r.violations);
  const summary = {
    totalEmployees: employees.length,
    compliantEmployees: employees.length - results.length,
    violationCount: allViolations.length,
    criticalViolations: allViolations.filter((v) => v.severity === 'critical').length,
    highViolations: allViolations.filter((v) => v.severity === 'high').length,
    mediumViolations: allViolations.filter((v) => v.severity === 'medium').length,
    lowViolations: allViolations.filter((v) => v.severity === 'low').length,
  };

  // Format violations
  const violations = results.map((r) => {
    const jurisdictionKey = makeJurisdictionKey(r.employee.jurisdiction);
    return {
      employeeId: r.employee.id || 'unknown',
      employeeName: r.employee.name || 'Unknown',
      jurisdiction: jurisdictionKey,
      violations: r.violations,
    };
  });

  // Group by jurisdiction if requested
  let byJurisdiction: Map<
    string,
    {
      employeeCount: number;
      violationCount: number;
      violations: ComplianceViolation[];
    }
  > | undefined;

  if (options?.groupByJurisdiction) {
    byJurisdiction = new Map();

    for (const employee of employees) {
      const key = makeJurisdictionKey(employee.jurisdiction);
      if (!byJurisdiction.has(key)) {
        byJurisdiction.set(key, {
          employeeCount: 0,
          violationCount: 0,
          violations: [],
        });
      }

      const group = byJurisdiction.get(key)!;
      group.employeeCount++;

      const employeeViolations = results.find((r) => r.employee === employee)?.violations || [];
      group.violationCount += employeeViolations.length;
      group.violations.push(...employeeViolations);
    }
  }

  return {
    summary,
    violations,
    byJurisdiction,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function makeJurisdictionKey(identifier: JurisdictionIdentifier): string {
  const parts = [identifier.country];
  if (identifier.state) parts.push(identifier.state);
  if (identifier.city) parts.push(identifier.city);
  return parts.join(':');
}
