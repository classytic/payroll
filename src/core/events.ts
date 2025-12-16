/**
 * @classytic/payroll - Event System
 *
 * Type-safe event emitter for payroll lifecycle events
 * Enables loose coupling and extensibility
 */

import type {
  PayrollEvent,
  EmployeeDocument,
  PayrollRecordDocument,
  ObjectId,
  OperationContext,
} from '../types.js';

// ============================================================================
// Event Payload Types
// ============================================================================

export interface EmployeeHiredEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
    position: string;
    department?: string;
  };
  organizationId: ObjectId;
  context?: OperationContext;
}

export interface EmployeeTerminatedEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
    name?: string;
  };
  terminationDate: Date;
  reason?: string;
  organizationId: ObjectId;
  context?: OperationContext;
}

export interface EmployeeRehiredEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
    position: string;
  };
  previousTerminationDate?: Date;
  organizationId: ObjectId;
  context?: OperationContext;
}

export interface SalaryUpdatedEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
  };
  previousSalary: number;
  newSalary: number;
  effectiveFrom: Date;
  organizationId: ObjectId;
  context?: OperationContext;
}

export interface SalaryProcessedEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
    name?: string;
  };
  payroll: {
    id: ObjectId;
    period: { month: number; year: number };
    grossAmount: number;
    netAmount: number;
  };
  transactionId: ObjectId;
  organizationId: ObjectId;
  context?: OperationContext;
}

export interface SalaryFailedEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
  };
  period: { month: number; year: number };
  error: string;
  organizationId: ObjectId;
  context?: OperationContext;
}

export interface PayrollCompletedEventPayload {
  organizationId: ObjectId;
  period: { month: number; year: number };
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalAmount: number;
  };
  context?: OperationContext;
}

export interface PayrollExportedEventPayload {
  organizationId: ObjectId;
  dateRange: { start: Date; end: Date };
  recordCount: number;
  format: string;
  context?: OperationContext;
}

export interface CompensationChangedEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
  };
  changeType: 'allowance_added' | 'allowance_removed' | 'deduction_added' | 'deduction_removed';
  details: {
    type: string;
    amount: number;
  };
  organizationId: ObjectId;
  context?: OperationContext;
}

export interface MilestoneAchievedEventPayload {
  employee: {
    id: ObjectId;
    employeeId: string;
    name?: string;
  };
  milestone: {
    type: 'tenure' | 'salary' | 'payments';
    value: number;
    message: string;
  };
  organizationId: ObjectId;
}

// ============================================================================
// Event Map
// ============================================================================

export interface PayrollEventMap {
  'employee:hired': EmployeeHiredEventPayload;
  'employee:terminated': EmployeeTerminatedEventPayload;
  'employee:rehired': EmployeeRehiredEventPayload;
  'salary:updated': SalaryUpdatedEventPayload;
  'salary:processed': SalaryProcessedEventPayload;
  'salary:failed': SalaryFailedEventPayload;
  'payroll:completed': PayrollCompletedEventPayload;
  'payroll:exported': PayrollExportedEventPayload;
  'compensation:changed': CompensationChangedEventPayload;
  'milestone:achieved': MilestoneAchievedEventPayload;
}

export type PayrollEventType = keyof PayrollEventMap;

// ============================================================================
// Event Handler Types
// ============================================================================

export type EventHandler<T> = (payload: T) => void | Promise<void>;

export type PayrollEventHandler<K extends PayrollEventType> = EventHandler<
  PayrollEventMap[K]
>;

// ============================================================================
// EventBus Class
// ============================================================================

export class EventBus {
  private handlers = new Map<
    PayrollEventType,
    Set<EventHandler<unknown>>
  >();

  /**
   * Register an event handler
   */
  on<K extends PayrollEventType>(
    event: K,
    handler: PayrollEventHandler<K>
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Register a one-time event handler
   */
  once<K extends PayrollEventType>(
    event: K,
    handler: PayrollEventHandler<K>
  ): () => void {
    const wrappedHandler: PayrollEventHandler<K> = async (payload) => {
      this.off(event, wrappedHandler);
      await handler(payload);
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Remove an event handler
   */
  off<K extends PayrollEventType>(
    event: K,
    handler: PayrollEventHandler<K>
  ): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler as EventHandler<unknown>);
    }
  }

  /**
   * Emit an event
   */
  async emit<K extends PayrollEventType>(
    event: K,
    payload: PayrollEventMap[K]
  ): Promise<void> {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }

    const handlers = Array.from(eventHandlers);
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(payload);
        } catch (error) {
          console.error(`Event handler error for ${event}:`, error);
        }
      })
    );
  }

  /**
   * Emit event synchronously (fire-and-forget)
   */
  emitSync<K extends PayrollEventType>(
    event: K,
    payload: PayrollEventMap[K]
  ): void {
    void this.emit(event, payload);
  }

  /**
   * Remove all handlers for an event
   */
  removeAllListeners(event?: PayrollEventType): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event: PayrollEventType): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * Get all registered events
   */
  eventNames(): PayrollEventType[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================================
// Default EventBus Instance
// ============================================================================

let defaultEventBus: EventBus | null = null;

/**
 * Get or create the default event bus
 */
export function getEventBus(): EventBus {
  if (!defaultEventBus) {
    defaultEventBus = new EventBus();
  }
  return defaultEventBus;
}

/**
 * Create a new event bus instance
 */
export function createEventBus(): EventBus {
  return new EventBus();
}

/**
 * Reset the default event bus (for testing)
 */
export function resetEventBus(): void {
  if (defaultEventBus) {
    defaultEventBus.removeAllListeners();
  }
  defaultEventBus = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Subscribe to employee hired events
 */
export function onEmployeeHired(
  handler: PayrollEventHandler<'employee:hired'>
): () => void {
  return getEventBus().on('employee:hired', handler);
}

/**
 * Subscribe to salary processed events
 */
export function onSalaryProcessed(
  handler: PayrollEventHandler<'salary:processed'>
): () => void {
  return getEventBus().on('salary:processed', handler);
}

/**
 * Subscribe to payroll completed events
 */
export function onPayrollCompleted(
  handler: PayrollEventHandler<'payroll:completed'>
): () => void {
  return getEventBus().on('payroll:completed', handler);
}

/**
 * Subscribe to milestone achieved events
 */
export function onMilestoneAchieved(
  handler: PayrollEventHandler<'milestone:achieved'>
): () => void {
  return getEventBus().on('milestone:achieved', handler);
}

