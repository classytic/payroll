/**
 * @classytic/payroll - Plugin System
 *
 * Extensible plugin architecture for customization
 * Follows patterns from popular libraries like Mongoose, Fastify
 */

import type { PayrollInstance } from '../types.js';
import type { EventBus, PayrollEventType, PayrollEventMap } from './events.js';

// ============================================================================
// Plugin Context
// ============================================================================

export interface PluginContext {
  /** Payroll instance */
  payroll: PayrollInstance;
  /** Event bus for subscribing to events */
  events: EventBus;
  /** Logger instance */
  logger: PluginLogger;
  /** Configuration getter */
  getConfig: <T>(key: string) => T | undefined;
  /** Register a hook */
  addHook: <K extends PayrollEventType>(
    event: K,
    handler: (payload: PayrollEventMap[K]) => void | Promise<void>
  ) => () => void;
}

export interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Plugin Hooks
// ============================================================================

export interface PluginHooks {
  /** Called before employee is hired */
  beforeHire?: (params: unknown) => void | Promise<void>;
  /** Called after employee is hired */
  afterHire?: (employee: unknown) => void | Promise<void>;
  /** Called before salary is processed */
  beforeProcessSalary?: (params: unknown) => void | Promise<void>;
  /** Called after salary is processed */
  afterProcessSalary?: (result: unknown) => void | Promise<void>;
  /** Called before termination */
  beforeTerminate?: (params: unknown) => void | Promise<void>;
  /** Called after termination */
  afterTerminate?: (employee: unknown) => void | Promise<void>;
  /** Called on any error */
  onError?: (error: Error, context: string) => void | Promise<void>;
}

// ============================================================================
// Payroll Plugin Interface
// ============================================================================

export interface PayrollPluginDefinition {
  name: string;
  version?: string;
  hooks?: PluginHooks;
  init?: (context: PluginContext) => void | Promise<void>;
  destroy?: () => void | Promise<void>;
}

// ============================================================================
// Plugin Manager
// ============================================================================

export class PluginManager {
  private plugins = new Map<string, PayrollPluginDefinition>();
  private hooks = new Map<keyof PluginHooks, Array<NonNullable<PluginHooks[keyof PluginHooks]>>>();

  constructor(private context: PluginContext) {}

  /**
   * Register a plugin
   */
  async register(plugin: PayrollPluginDefinition): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    // Register hooks
    if (plugin.hooks) {
      for (const [hookName, handler] of Object.entries(plugin.hooks)) {
        if (handler) {
          this.addHook(hookName as keyof PluginHooks, handler);
        }
      }
    }

    // Initialize plugin
    if (plugin.init) {
      await plugin.init(this.context);
    }

    this.plugins.set(plugin.name, plugin);
    this.context.logger.debug(`Plugin "${plugin.name}" registered`);
  }

  /**
   * Unregister a plugin
   */
  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return;
    }

    if (plugin.destroy) {
      await plugin.destroy();
    }

    this.plugins.delete(name);
    this.context.logger.debug(`Plugin "${name}" unregistered`);
  }

  /**
   * Add a hook handler
   */
  private addHook<K extends keyof PluginHooks>(
    hookName: K,
    handler: NonNullable<PluginHooks[K]>
  ): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName)!.push(handler);
  }

  /**
   * Execute hooks for a given event
   */
  async executeHooks<K extends keyof PluginHooks>(
    hookName: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ): Promise<void> {
    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        await (handler as (...args: unknown[]) => void | Promise<void>)(...args);
      } catch (error) {
        this.context.logger.error(`Hook "${hookName}" error:`, { error });
        // Execute onError hooks
        const errorHandlers = this.hooks.get('onError');
        if (errorHandlers) {
          for (const errorHandler of errorHandlers) {
            try {
              await (errorHandler as PluginHooks['onError'])!(error as Error, hookName);
            } catch {
              // Ignore errors in error handlers
            }
          }
        }
      }
    }
  }

  /**
   * Get registered plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Check if plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }
}

// ============================================================================
// Plugin Definition Helper
// ============================================================================

/**
 * Define a plugin with type safety
 */
export function definePlugin(
  definition: PayrollPluginDefinition
): PayrollPluginDefinition {
  return definition;
}

// ============================================================================
// Built-in Plugins
// ============================================================================

/**
 * Logging plugin - logs all payroll events
 */
export const loggingPlugin = definePlugin({
  name: 'logging',
  version: '1.0.0',
  init: (context) => {
    // Subscribe to all events
    context.addHook('employee:hired', (payload) => {
      context.logger.info('Employee hired', {
        employeeId: payload.employee.employeeId,
        position: payload.employee.position,
      });
    });

    context.addHook('salary:processed', (payload) => {
      context.logger.info('Salary processed', {
        employeeId: payload.employee.employeeId,
        amount: payload.payroll.netAmount,
        period: payload.payroll.period,
      });
    });

    context.addHook('employee:terminated', (payload) => {
      context.logger.info('Employee terminated', {
        employeeId: payload.employee.employeeId,
        reason: payload.reason,
      });
    });
  },
  hooks: {
    onError: (error, context) => {
      console.error(`[Payroll Error] ${context}:`, error.message);
    },
  },
});

/**
 * Metrics plugin - collects payroll metrics
 */
export const metricsPlugin = definePlugin({
  name: 'metrics',
  version: '1.0.0',
  init: (context) => {
    const metrics = {
      employeesHired: 0,
      employeesTerminated: 0,
      salariesProcessed: 0,
      totalPaid: 0,
      errors: 0,
    };

    context.addHook('employee:hired', () => {
      metrics.employeesHired++;
    });

    context.addHook('employee:terminated', () => {
      metrics.employeesTerminated++;
    });

    context.addHook('salary:processed', (payload) => {
      metrics.salariesProcessed++;
      metrics.totalPaid += payload.payroll.netAmount;
    });

    // Expose metrics on payroll instance
    (context.payroll as unknown as { metrics: typeof metrics }).metrics = metrics;
  },
  hooks: {
    onError: (error, context) => {
      // Increment error counter
    },
  },
});

/**
 * Notification plugin - sends notifications for events
 */
export interface NotificationPluginOptions {
  onHired?: (employee: { id: unknown; name?: string }) => void | Promise<void>;
  onTerminated?: (employee: { id: unknown; name?: string }) => void | Promise<void>;
  onSalaryProcessed?: (details: { 
    employee: { id: unknown; name?: string };
    amount: number;
  }) => void | Promise<void>;
  onMilestone?: (details: {
    employee: { id: unknown; name?: string };
    milestone: string;
  }) => void | Promise<void>;
}

export function createNotificationPlugin(
  options: NotificationPluginOptions
): PayrollPluginDefinition {
  return definePlugin({
    name: 'notification',
    version: '1.0.0',
    init: (context) => {
      if (options.onHired) {
        context.addHook('employee:hired', async (payload) => {
          await options.onHired!({
            id: payload.employee.id,
            name: payload.employee.position,
          });
        });
      }

      if (options.onTerminated) {
        context.addHook('employee:terminated', async (payload) => {
          await options.onTerminated!({
            id: payload.employee.id,
            name: payload.employee.name,
          });
        });
      }

      if (options.onSalaryProcessed) {
        context.addHook('salary:processed', async (payload) => {
          await options.onSalaryProcessed!({
            employee: {
              id: payload.employee.id,
              name: payload.employee.name,
            },
            amount: payload.payroll.netAmount,
          });
        });
      }

      if (options.onMilestone) {
        context.addHook('milestone:achieved', async (payload) => {
          await options.onMilestone!({
            employee: {
              id: payload.employee.id,
              name: payload.employee.name,
            },
            milestone: payload.milestone.message,
          });
        });
      }
    },
  });
}

// Alias for backwards compatibility
export const notificationPlugin = createNotificationPlugin({});

