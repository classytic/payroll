export const HRM_CONFIG = {
  // Data Retention: Auto-delete exported records after 2 years
  // Organizations must download records via /payroll/export API before deletion
  dataRetention: {
    payrollRecordsTTL: 63072000,  // 2 years in seconds
    exportWarningDays: 30,         // Warn before TTL expires
  },

  payroll: {
    defaultCurrency: 'BDT',
    allowProRating: true,
    attendanceIntegration: true,
    autoDeductions: true,
    overtimeEnabled: false,
  },

  salary: {
    minimumWage: 0,
    maximumAllowances: 10,
    maximumDeductions: 10,
    defaultFrequency: 'monthly',
  },

  employment: {
    defaultProbationMonths: 3,
    maxProbationMonths: 6,
    allowReHiring: true,
    trackEmploymentHistory: true,
  },

  validation: {
    requireBankDetails: false,
    requireEmployeeId: true,
    uniqueEmployeeIdPerOrg: true,
    allowMultiTenantEmployees: true,
  },
};

// ============ ORGANIZATION ROLES CONFIGURATION ============
// Defines available organization roles for frontend authentication and access control
// Frontend is responsible for implementing access control based on these roles
export const ORG_ROLES = {
  OWNER: {
    key: 'owner',
    label: 'Owner',
    description: 'Full organization access (set by Organization model)',
  },
  MANAGER: {
    key: 'manager',
    label: 'Manager',
    description: 'Management and administrative features',
  },
  TRAINER: {
    key: 'trainer',
    label: 'Trainer',
    description: 'Training and coaching features',
  },
  STAFF: {
    key: 'staff',
    label: 'Staff',
    description: 'General staff access to basic features',
  },
  INTERN: {
    key: 'intern',
    label: 'Intern',
    description: 'Limited access for interns',
  },
  CONSULTANT: {
    key: 'consultant',
    label: 'Consultant',
    description: 'Project-based consultant access',
  },
};

// Get all available org role keys
export const ORG_ROLE_KEYS = Object.values(ORG_ROLES).map(role => role.key);

// ============ ROLE MAPPING CONFIGURATION ============
// Maps employee attributes (department, position, employment type) to organization roles
// Priority: department > employmentType > default
export const ROLE_MAPPING = {
  // Department-based mapping (highest priority)
  byDepartment: {
    management: 'manager',
    training: 'trainer',
    sales: 'staff',
    operations: 'staff',
    finance: 'staff',
    hr: 'staff',
    marketing: 'staff',
    it: 'staff',
    support: 'staff',
  },

  // Employment type mapping (fallback)
  byEmploymentType: {
    full_time: 'staff',
    part_time: 'staff',
    contract: 'consultant',
    intern: 'intern',
    consultant: 'consultant',
  },

  // Default role if no match found
  default: 'staff',
};

export const SALARY_BANDS = {
  intern: { min: 10000, max: 20000 },
  junior: { min: 20000, max: 40000 },
  mid: { min: 40000, max: 70000 },
  senior: { min: 70000, max: 120000 },
  lead: { min: 100000, max: 200000 },
  executive: { min: 150000, max: 500000 },
};

export const TAX_BRACKETS = {
  BDT: [
    { min: 0, max: 300000, rate: 0 },
    { min: 300000, max: 400000, rate: 0.05 },
    { min: 400000, max: 500000, rate: 0.10 },
    { min: 500000, max: 600000, rate: 0.15 },
    { min: 600000, max: 3000000, rate: 0.20 },
    { min: 3000000, max: Infinity, rate: 0.25 },
  ],
};

export function calculateTax(annualIncome, currency = 'BDT') {
  const brackets = TAX_BRACKETS[currency];
  if (!brackets) return 0;

  let tax = 0;
  for (const bracket of brackets) {
    if (annualIncome > bracket.min) {
      const taxableAmount = Math.min(annualIncome, bracket.max) - bracket.min;
      tax += taxableAmount * bracket.rate;
    }
  }
  return Math.round(tax);
}

export function getSalaryBand(amount) {
  for (const [band, range] of Object.entries(SALARY_BANDS)) {
    if (amount >= range.min && amount <= range.max) {
      return band;
    }
  }
  return 'custom';
}

/**
 * Determines the appropriate organization role for an employee
 * Based on department, employment type, and position
 * @param {Object} employmentData - Employee's employment data
 * @param {string} employmentData.department - Employee's department
 * @param {string} employmentData.type - Employment type (full_time, intern, etc.)
 * @param {string} employmentData.position - Job position/title
 * @returns {string} Organization role key
 */
export function determineOrgRole(employmentData = {}) {
  const { department, type: employmentType } = employmentData;

  // Priority 1: Department-based mapping
  if (department && ROLE_MAPPING.byDepartment[department]) {
    return ROLE_MAPPING.byDepartment[department];
  }

  // Priority 2: Employment type mapping
  if (employmentType && ROLE_MAPPING.byEmploymentType[employmentType]) {
    return ROLE_MAPPING.byEmploymentType[employmentType];
  }

  // Priority 3: Default role
  return ROLE_MAPPING.default;
}

export default HRM_CONFIG;
