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
  type TaxResult,
  type AttendanceInput,
  type SalaryCalculationResult,
  // Constants
  COUNTRY_DEFAULTS,
  DEFAULT_WORK_SCHEDULE,
  DEFAULT_TAX_BRACKETS,
  // Pure Calculation Functions
  countWorkingDays,
  calculateProration,
  calculateTax,
  calculateAttendanceDeduction,
  calculateSalaryBreakdown,
  getPayPeriod,
} from './config.js';
