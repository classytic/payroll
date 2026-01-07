/**
 * @classytic/payroll - Employee Service
 *
 * High-level employee operations with dependency injection
 */

import type { Model, ClientSession } from 'mongoose';
import type {
  ObjectIdLike,
  EmployeeDocument,
  EmployeeStatus,
  Department,
  EmploymentType,
  Compensation,
  OperationContext,
  HRMConfig,
} from '../types.js';
import { EmployeeFactory, type CreateEmployeeParams } from '../factories/employee.factory.js';
import { employee as employeeQuery, toObjectId } from '../utils/query-builders.js';
import { isActive, isEmployed, canReceiveSalary } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { HRM_CONFIG } from '../config.js';

// ============================================================================
// Employee Service
// ============================================================================

export class EmployeeService {
  private readonly config: HRMConfig;

  constructor(
    private readonly EmployeeModel: Model<EmployeeDocument>,
    config?: HRMConfig
  ) {
    this.config = config || HRM_CONFIG;
  }

  /**
   * Find employee by ID
   */
  async findById(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession; populate?: boolean } = {}
  ): Promise<EmployeeDocument | null> {
    let query = this.EmployeeModel.findById(toObjectId(employeeId));
    
    if (options.session) {
      query = query.session(options.session);
    }
    
    if (options.populate) {
      query = query.populate('userId', 'name email phone');
    }
    
    return query.exec();
  }

  /**
   * Find employee by user and organization
   */
  async findByUserId(
    userId: ObjectIdLike,
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument | null> {
    const query = employeeQuery()
      .forUser(userId)
      .forOrganization(organizationId)
      .build();

    let mongooseQuery = this.EmployeeModel.findOne(query);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Find employee by employeeId (human-readable ID)
   */
  async findByEmployeeId(
    employeeId: string,
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument | null> {
    const query = employeeQuery()
      .forEmployeeId(employeeId)
      .forOrganization(organizationId)
      .build();

    let mongooseQuery = this.EmployeeModel.findOne(query);

    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }

    return mongooseQuery.exec();
  }

  /**
   * Find employee by email (guest employees)
   */
  async findByEmail(
    email: string,
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument | null> {
    const query = employeeQuery()
      .forEmail(email)
      .forOrganization(organizationId)
      .build();

    let mongooseQuery = this.EmployeeModel.findOne(query);

    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }

    return mongooseQuery.exec();
  }

  /**
   * Find all guest employees (no userId)
   */
  async findGuestEmployees(
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument[]> {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .guestEmployees()
      .build();

    let mongooseQuery = this.EmployeeModel.find(query);

    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }

    return mongooseQuery.exec();
  }

  /**
   * Find active employees in organization
   */
  async findActive(
    organizationId: ObjectIdLike,
    options: { session?: ClientSession; projection?: Record<string, number> } = {}
  ): Promise<EmployeeDocument[]> {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .active()
      .build();

    let mongooseQuery = this.EmployeeModel.find(query, options.projection);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Find employed employees (not terminated)
   */
  async findEmployed(
    organizationId: ObjectIdLike,
    options: { session?: ClientSession; projection?: Record<string, number> } = {}
  ): Promise<EmployeeDocument[]> {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .employed()
      .build();

    let mongooseQuery = this.EmployeeModel.find(query, options.projection);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Find employees by department
   */
  async findByDepartment(
    organizationId: ObjectIdLike,
    department: Department,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument[]> {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .inDepartment(department)
      .active()
      .build();

    let mongooseQuery = this.EmployeeModel.find(query);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Find employees eligible for payroll
   */
  async findEligibleForPayroll(
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument[]> {
    const query = employeeQuery()
      .forOrganization(organizationId)
      .employed()
      .build();

    let mongooseQuery = this.EmployeeModel.find(query);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    const employees = await mongooseQuery.exec();
    return employees.filter((emp) => canReceiveSalary(emp));
  }

  /**
   * Create new employee
   */
  async create(
    params: CreateEmployeeParams,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument> {
    const employeeData = EmployeeFactory.create(params, this.config);

    let employee: EmployeeDocument;

    // For guest employees, use insertOne to avoid Mongoose setting undefined fields to null
    // This ensures partial indexes work correctly (partial index only includes docs with userId)
    if (!params.userId) {
      // Guest employee - use direct MongoDB insertOne to preserve partial index behavior
      const dataToInsert: Record<string, any> = {};

      // Copy all fields from employeeData except userId/email which need special handling
      for (const [key, value] of Object.entries(employeeData)) {
        if (key === 'userId' || key === 'email') continue;
        dataToInsert[key] = value;
      }

      // Only include email if it exists and is not empty (critical for partial index)
      if (employeeData.email && employeeData.email !== '') {
        dataToInsert.email = employeeData.email;
      }

      // NEVER include userId for guest employees (partial index excludes docs without userId)
      // Add timestamps manually since we're bypassing Mongoose
      const now = new Date();
      dataToInsert.createdAt = now;
      dataToInsert.updatedAt = now;

      // Use direct MongoDB insertOne
      const insertOptions = options.session ? { session: options.session as any } : {};
      const result = await this.EmployeeModel.collection.insertOne(
        dataToInsert,
        insertOptions
      );

      // Convert back to Mongoose document
      employee = await this.EmployeeModel.findById(result.insertedId).session(options.session || null).exec() as EmployeeDocument;
    } else {
      // Regular employee with userId - use Mongoose create
      const [created] = await this.EmployeeModel.create([employeeData], {
        session: options.session,
      });
      employee = created;
    }

    logger.info('Employee created', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
    });

    return employee;
  }

  /**
   * Update employee status
   */
  async updateStatus(
    employeeId: ObjectIdLike,
    status: EmployeeStatus,
    context: OperationContext = {},
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument> {
    const employee = await this.findById(employeeId, options);
    if (!employee) {
      throw new Error('Employee not found');
    }

    employee.status = status;
    await employee.save({ session: options.session });

    logger.info('Employee status updated', {
      employeeId: employee.employeeId,
      newStatus: status,
    });

    return employee;
  }

  /**
   * Update employee compensation
   * 
   * NOTE: This merges the compensation fields rather than replacing the entire object.
   * To update allowances/deductions, use addAllowance/removeAllowance methods.
   */
  async updateCompensation(
    employeeId: ObjectIdLike,
    compensation: Partial<Compensation>,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument> {
    // First fetch the employee to get current compensation
    const currentEmployee = await this.EmployeeModel.findById(toObjectId(employeeId)).session(options.session || null);
    if (!currentEmployee) {
      throw new Error('Employee not found');
    }

    // Build update object that only sets provided fields
    const updateFields: Record<string, unknown> = {
      'compensation.lastModified': new Date(),
    };

    // Only update specific fields if provided (preserve allowances/deductions)
    if (compensation.baseAmount !== undefined) {
      updateFields['compensation.baseAmount'] = compensation.baseAmount;
    }
    if (compensation.currency !== undefined) {
      updateFields['compensation.currency'] = compensation.currency;
    }
    if (compensation.frequency !== undefined) {
      updateFields['compensation.frequency'] = compensation.frequency;
    }
    if (compensation.effectiveFrom !== undefined) {
      updateFields['compensation.effectiveFrom'] = compensation.effectiveFrom;
    }
    // Note: allowances and deductions should NOT be updated here
    // Use addAllowance/removeAllowance methods instead

    const employee = await this.EmployeeModel.findByIdAndUpdate(
      toObjectId(employeeId),
      { $set: updateFields },
      { new: true, runValidators: true, session: options.session }
    );

    if (!employee) {
      throw new Error('Employee not found');
    }

    return employee;
  }

  /**
   * Get employee statistics for organization
   */
  async getEmployeeStats(
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<{
    total: number;
    active: number;
    employed: number;
    canReceiveSalary: number;
    byStatus: Record<string, number>;
    byDepartment: Record<string, number>;
  }> {
    const query = employeeQuery().forOrganization(organizationId).build();
    
    let mongooseQuery = this.EmployeeModel.find(query);
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    const employees = await mongooseQuery.exec();

    return {
      total: employees.length,
      active: employees.filter(isActive).length,
      employed: employees.filter(isEmployed).length,
      canReceiveSalary: employees.filter(canReceiveSalary).length,
      byStatus: this.groupByStatus(employees),
      byDepartment: this.groupByDepartment(employees),
    };
  }

  /**
   * Group employees by status
   */
  private groupByStatus(employees: EmployeeDocument[]): Record<string, number> {
    return employees.reduce(
      (acc, emp) => {
        acc[emp.status] = (acc[emp.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Group employees by department
   */
  private groupByDepartment(employees: EmployeeDocument[]): Record<string, number> {
    return employees.reduce(
      (acc, emp) => {
        const dept = emp.department || 'unassigned';
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Check if employee is active
   */
  isActive(employee: EmployeeDocument): boolean {
    return isActive(employee);
  }

  /**
   * Check if employee is employed
   */
  isEmployed(employee: EmployeeDocument): boolean {
    return isEmployed(employee);
  }

  /**
   * Check if employee can receive salary
   */
  canReceiveSalary(employee: EmployeeDocument): boolean {
    return canReceiveSalary(employee);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create employee service instance
 */
export function createEmployeeService(
  EmployeeModel: Model<EmployeeDocument>,
  config?: HRMConfig
): EmployeeService {
  return new EmployeeService(EmployeeModel, config);
}

