/**
 * @classytic/payroll - Core Module
 *
 * Core utilities: Result type, events, plugins, container, calculations
 */

// ============================================================================
// Result Type
// ============================================================================

export {
  Result,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  flatMap,
  tryCatch,
  tryCatchSync,
  all,
  match,
  fromPromise,
  fromNullable,
  ResultClass,
  type Ok,
  type Err,
} from './result.js';

// ============================================================================
// Event System
// ============================================================================

export {
  EventBus,
  createEventBus,
  getEventBus,
  resetEventBus,
  onEmployeeHired,
  onSalaryProcessed,
  onPayrollCompleted,
  onMilestoneAchieved,
  type PayrollEventMap,
  type PayrollEventType,
  type PayrollEventHandler,
  type EmployeeHiredEventPayload,
  type EmployeeTerminatedEventPayload,
  type EmployeeRehiredEventPayload,
  type SalaryUpdatedEventPayload,
  type SalaryProcessedEventPayload,
  type SalaryFailedEventPayload,
  type PayrollCompletedEventPayload,
  type PayrollExportedEventPayload,
  type CompensationChangedEventPayload,
  type MilestoneAchievedEventPayload,
} from './events.js';

// ============================================================================
// Idempotency (Stripe-style)
// ============================================================================

export {
  IdempotencyManager,
  generatePayrollIdempotencyKey,
  type IdempotentResult,
} from './idempotency.js';

// ============================================================================
// Webhooks (Stripe-style)
// ============================================================================

export {
  WebhookManager,
  type WebhookConfig,
  type WebhookDelivery,
} from './webhooks.js';

// ============================================================================
// Plugin System
// ============================================================================

export {
  PluginManager,
  definePlugin,
  loggingPlugin,
  metricsPlugin,
  notificationPlugin,
  createNotificationPlugin,
  type PluginContext,
  type PluginLogger,
  type PluginHooks,
  type PayrollPluginDefinition,
  type NotificationPluginOptions,
} from './plugin.js';

// ============================================================================
// Repository Plugins (Mongokit Integration)
// ============================================================================

export {
  multiTenantPlugin,
} from './repository-plugins.js';

// ============================================================================
// Container
// ============================================================================

export {
  Container,
  getContainer,
  initializeContainer,
  isContainerInitialized,
  getModels,
  getConfig,
  isSingleTenant,
  type ModelsContainer,
  type ContainerConfig,
} from './container.js';

// ============================================================================
// Configuration & Calculations (Simple API)
// ============================================================================

export {
  // Types
  type WorkSchedule,
  type PayrollProcessingOptions,
  type WorkingDaysResult,
  type ProrationResult,
  type AttendanceInput,
  // Constants
  DEFAULT_WORK_SCHEDULE,
  // Pure Calculation Functions
  countWorkingDays,
  calculateProration,
  getPayPeriod,
} from './config.js';

// Re-export calculateAttendanceDeduction from calculators for backward compatibility
// The canonical version uses banker's rounding and returns detailed result
export { calculateAttendanceDeduction } from '../calculators/attendance.calculator.js';

// Canonical salary breakdown calculator (single source of truth)
export { calculateSalaryBreakdown } from '../calculators/salary.calculator.js';

// ============================================================================
// State Machines
// ============================================================================

export {
  // State machine utility
  StateMachine,
  createStateMachine,
  type StateMachineConfig,
  type StateTransition,
  type TransitionResult,
  // Payroll status machine
  PayrollStatusMachine,
  type PayrollStatusState,
  // Tax status machine
  TaxStatusMachine,
  type TaxStatusState,
  // Leave request status machine
  LeaveRequestStatusMachine,
  type LeaveRequestStatusState,
  // Employee status machine
  EmployeeStatusMachine,
  type EmployeeStatusState,
} from './payroll-states.js';

// ============================================================================
// Timeline Audit Integration (@classytic/mongoose-timeline-audit)
// ============================================================================

export {
  // Event constants for timeline tracking
  PAYROLL_EVENTS,
  type PayrollTimelineEvent,
  // Recommended configurations for each model
  EMPLOYEE_TIMELINE_CONFIG,
  PAYROLL_RECORD_TIMELINE_CONFIG,
  LEAVE_REQUEST_TIMELINE_CONFIG,
  // Helper functions
  buildTimelineMetadata,
  buildRequestContext,
} from './timeline-audit.js';
