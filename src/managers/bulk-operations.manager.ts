/**
 * @classytic/payroll - Bulk Operations Manager
 *
 * Handles bulk payroll processing with advanced features:
 * - Progress tracking
 * - Cancellation support
 * - Batch processing
 * - Concurrency control
 * - Streaming for large datasets (10k+ employees)
 */

import mongoose, { Model } from 'mongoose';
import pLimit from 'p-limit';
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  AnyDocument,
  ObjectId,
  ObjectIdLike,
  ProcessBulkPayrollParams,
  BulkPayrollResult,
  BulkPayrollProgress,
  PaymentMethod,
  OperationContext,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { toObjectId } from '../utils/query-builders.js';
import type { EventBus } from '../core/events.js';

/**
 * BulkOperationsManager
 *
 * Master of parallel processing - handles bulk payroll with enterprise features.
 * Automatically switches to streaming mode for large datasets (>10k employees).
 *
 * Key features:
 * - **Progress tracking**: Real-time progress callbacks
 * - **Cancellation**: AbortSignal support
 * - **Batch processing**: Configurable batch size
 * - **Concurrency control**: Limit parallel operations
 * - **Streaming**: Memory-efficient for millions of employees
 *
 * @example Basic usage
 * ```typescript
 * const manager = new BulkOperationsManager(...);
 * const result = await manager.processBulkPayroll({
 *   organizationId,
 *   month: 1,
 *   year: 2024,
 * });
 * ```
 *
 * @example With progress tracking
 * ```typescript
 * await manager.processBulkPayroll({
 *   organizationId,
 *   month: 1,
 *   year: 2024,
 *   onProgress: (p) => console.log(`${p.percentage}% done`),
 * });
 * ```
 *
 * @example With concurrency control
 * ```typescript
 * await manager.processBulkPayroll({
 *   organizationId,
 *   month: 1,
 *   year: 2024,
 *   concurrency: 5, // Process 5 employees at a time
 *   batchSize: 20,  // 20 employees per batch
 * });
 * ```
 */
export class BulkOperationsManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument
> {
  constructor(
    private readonly models: {
      EmployeeModel: Model<TEmployee>;
      PayrollRecordModel: Model<TPayrollRecord>;
      TransactionModel: Model<TTransaction>;
      AttendanceModel?: Model<TAttendance> | null;
    },
    private readonly events: EventBus,
    private readonly processSalaryFn: (params: any) => Promise<any>
  ) {}

  /**
   * Process bulk payroll for multiple employees
   *
   * ATOMICITY STRATEGY: Each employee is processed in its own transaction.
   * This allows partial success - some employees can succeed while others fail.
   * Failed employees don't affect successful ones.
   *
   * @param params - Bulk payroll parameters
   * @returns Results with successful and failed employees
   */
  async processBulkPayroll(params: ProcessBulkPayrollParams): Promise<BulkPayrollResult> {
    const {
      organizationId,
      month,
      year,
      employeeIds = [],
      paymentDate = new Date(),
      paymentMethod = 'bank',
      options,
      context,
      // Progress and control params
      onProgress,
      signal,
      batchSize = 10,
      batchDelay = 0,
      concurrency = 1,
      useStreaming,
    } = params;

    const query: Record<string, unknown> = { organizationId: toObjectId(organizationId), status: 'active' };
    if (employeeIds.length > 0) {
      query._id = { $in: employeeIds.map(toObjectId) };
    }

    // Auto-detect streaming: use for >10k employees
    const employeeCount = await this.models.EmployeeModel.countDocuments(query);
    const shouldStream = useStreaming ?? (employeeCount > 10000);

    // Use streaming for large datasets
    if (shouldStream) {
      return this.processBulkPayrollStreaming({
        query,
        organizationId,
        month,
        year,
        paymentDate,
        paymentMethod,
        options,
        context,
        signal,
        batchSize,
        batchDelay,
        concurrency,
        onProgress,
        total: employeeCount,
      });
    }

    // Original implementation for smaller datasets
    const employees = await this.models.EmployeeModel.find(query);
    const total = employees.length;

    const results: BulkPayrollResult = {
      successful: [],
      failed: [],
      total,
    };

    // Helper to report progress
    const reportProgress = async (currentEmployee?: string) => {
      if (onProgress) {
        const processed = results.successful.length + results.failed.length;
        await onProgress({
          processed,
          total,
          successful: results.successful.length,
          failed: results.failed.length,
          currentEmployee,
          percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
        });
      }
    };

    // Process in batches
    for (let i = 0; i < employees.length; i += batchSize) {
      // Check for cancellation before each batch
      if (signal?.aborted) {
        getLogger().warn('Bulk payroll cancelled', {
          organizationId: organizationId.toString(),
          processed: results.successful.length + results.failed.length,
          total,
        });
        throw new Error('Payroll processing cancelled by user');
      }

      const batch = employees.slice(i, i + batchSize);

      if (concurrency === 1) {
        // SEQUENTIAL (default, safest)
        for (const employee of batch) {
          if (signal?.aborted) throw new Error('Payroll processing cancelled by user');

          try {
            const result = await this.processSalaryFn({
              employeeId: employee._id,
              organizationId,
              month,
              year,
              paymentDate,
              paymentMethod,
              options,
              context: { ...context, session: undefined },
            });

            results.successful.push({
              employeeId: employee.employeeId,
              amount: result.payrollRecord.breakdown.netSalary,
              transactionId: result.transaction._id,
            });
          } catch (error) {
            results.failed.push({
              employeeId: employee.employeeId,
              error: (error as Error).message,
            });

            getLogger().error('Failed to process salary', {
              employeeId: employee.employeeId,
              error: (error as Error).message,
            });
          }

          await reportProgress(employee.employeeId);
        }
      } else {
        // CONCURRENT (faster, more resources) - respects concurrency limit
        const limit = pLimit(concurrency);
        const batchResults = await Promise.allSettled(
          batch.map((employee) =>
            limit(() =>
              this.processSalaryFn({
                employeeId: employee._id,
                organizationId,
                month,
                year,
                paymentDate,
                paymentMethod,
                options,
                context: { ...context, session: undefined },
              }).then((result) => ({ employee, result }))
            )
          )
        );

        // Aggregate batch results
        for (let j = 0; j < batchResults.length; j++) {
          const batchResult = batchResults[j];
          const employee = batch[j];

          if (batchResult.status === 'fulfilled') {
            results.successful.push({
              employeeId: batchResult.value.employee.employeeId,
              amount: batchResult.value.result.payrollRecord.breakdown.netSalary,
              transactionId: batchResult.value.result.transaction._id,
            });
          } else {
            results.failed.push({
              employeeId: employee.employeeId,
              error: (batchResult.reason as Error).message || 'Unknown error',
            });

            getLogger().error('Failed to process salary (concurrent)', {
              employeeId: employee.employeeId,
              error: (batchResult.reason as Error).message,
            });
          }
        }

        await reportProgress();
      }

      // Pause between batches
      if (batchDelay > 0 && i + batchSize < employees.length) {
        await new Promise((resolve) => setTimeout(resolve, batchDelay));
      }
    }

    // Emit completed event
    this.events.emitSync('payroll:completed', {
      organizationId: toObjectId(organizationId),
      period: { month, year },
      summary: {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        totalAmount: results.successful.reduce((sum, r) => sum + r.amount, 0),
      },
      context,
    });

    getLogger().info('Bulk payroll processed', {
      organizationId: organizationId.toString(),
      month,
      year,
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      concurrency,
      batchSize,
    });

    return results;
  }

  /**
   * Stream-based bulk payroll processing for millions of employees.
   * Uses MongoDB cursors to avoid loading everything into memory.
   *
   * This is the **enterprise-grade** solution for massive datasets.
   * Automatically used when >10k employees.
   *
   * @private
   */
  private async processBulkPayrollStreaming(params: {
    query: Record<string, unknown>;
    organizationId: ObjectIdLike;
    month: number;
    year: number;
    paymentDate: Date;
    paymentMethod?: string;
    options?: any;
    context?: any;
    signal?: AbortSignal;
    batchSize: number;
    batchDelay: number;
    concurrency: number;
    onProgress?: (progress: BulkPayrollProgress) => void | Promise<void>;
    total: number;
  }): Promise<BulkPayrollResult> {
    const {
      query,
      organizationId,
      month,
      year,
      paymentDate,
      paymentMethod,
      options,
      context,
      signal,
      batchSize,
      batchDelay,
      concurrency,
      onProgress,
      total,
    } = params;

    const startTime = Date.now();
    const results: BulkPayrollResult = {
      successful: [],
      failed: [],
      total,
    };

    // Create cursor (streams employees one at a time)
    const cursor = this.models.EmployeeModel.find(query).cursor();

    let processed = 0;
    let batchCount = 0;
    const batchPromises: Array<Promise<void>> = [];

    // Concurrency control
    const limit = pLimit(concurrency);

    // Progress reporting helper
    const reportProgress = async (currentEmployee?: string) => {
      if (onProgress) {
        await onProgress({
          processed,
          total,
          successful: results.successful.length,
          failed: results.failed.length,
          currentEmployee,
          percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
        });
      }
    };

    // Stream employees
    for await (const employee of cursor) {
      // Check cancellation
      if (signal?.aborted) {
        cursor.close();
        getLogger().warn('Streaming bulk payroll cancelled', {
          processed,
          total,
        });
        throw new Error('Payroll processing cancelled by user');
      }

      // Add to worker pool
      const promise = limit(async () => {
        try {
          const result = await this.processSalaryFn({
            employeeId: employee._id,
            organizationId,
            month,
            year,
            paymentDate,
            paymentMethod: paymentMethod as PaymentMethod | undefined,
            options,
            context: { ...context, session: undefined },
          });

          results.successful.push({
            employeeId: employee.employeeId,
            amount: result.payrollRecord.breakdown.netSalary,
            transactionId: result.transaction._id,
          });
        } catch (error) {
          results.failed.push({
            employeeId: employee.employeeId,
            error: (error as Error).message,
          });

          getLogger().error('Failed to process salary (streaming)', {
            employeeId: employee.employeeId,
            error: (error as Error).message,
          });
        }
      });

      batchPromises.push(promise);
      processed++;

      // Batch completion
      if (processed % batchSize === 0) {
        await Promise.all(batchPromises);
        batchPromises.length = 0;
        batchCount++;

        await reportProgress();

        // Batch delay
        if (batchDelay > 0 && processed < total) {
          await new Promise((resolve) => setTimeout(resolve, batchDelay));
        }
      }
    }

    // Wait for final batch
    if (batchPromises.length > 0) {
      await Promise.all(batchPromises);
      await reportProgress();
    }

    // Emit completion event
    this.events.emitSync('payroll:completed', {
      organizationId: toObjectId(query.organizationId as ObjectIdLike),
      period: { month, year },
      summary: {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        totalAmount: results.successful.reduce((sum, r) => sum + r.amount, 0),
      },
      context,
    });

    const duration = Date.now() - startTime;

    getLogger().info('Streaming bulk payroll completed', {
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      duration,
      concurrency,
      batchSize,
    });

    return results;
  }
}

/**
 * Factory function for creating BulkOperationsManager
 */
export function createBulkOperationsManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument
>(
  models: {
    EmployeeModel: Model<TEmployee>;
    PayrollRecordModel: Model<TPayrollRecord>;
    TransactionModel: Model<TTransaction>;
    AttendanceModel?: Model<TAttendance> | null;
  },
  events: EventBus,
  processSalaryFn: (params: any) => Promise<any>
): BulkOperationsManager<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
  return new BulkOperationsManager(models, events, processSalaryFn) as any;
}
