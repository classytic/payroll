/**
 * @classytic/payroll - Payroll State Machines
 *
 * Defines valid state transitions for all status types.
 * Single source of truth for status management.
 */

import { createStateMachine, type StateMachine } from './state-machine.js';

// ============================================================================
// Payroll Record Status
// ============================================================================

/**
 * PayrollStatus state machine
 *
 * State diagram:
 * ```
 * PENDING ──┬──> PROCESSING ──┬──> PAID ──> REVERSED
 *           │        │        │
 *           │        │        └──> FAILED ──┐
 *           │        │                      │
 *           │        └──> VOIDED <──────────┘
 *           │              ↑
 *           └──────────────┘
 * ```
 *
 * - PENDING: Initial state, payroll created but not processed
 * - PROCESSING: Currently being processed (bulk operations)
 * - PAID: Payment completed successfully
 * - FAILED: Processing failed (can retry → pending, or void)
 * - VOIDED: Cancelled before payment (can restore → pending)
 * - REVERSED: Payment reversed after completion (terminal)
 */
export const PayrollStatusMachine = createStateMachine({
  states: ['pending', 'processing', 'paid', 'failed', 'voided', 'reversed'] as const,
  initial: 'pending',
  transitions: [
    // Normal flow
    { from: 'pending', to: 'processing' },
    { from: 'processing', to: 'paid' },

    // Direct payment (skip processing for single salary)
    { from: 'pending', to: 'paid' },

    // Failure handling
    { from: 'processing', to: 'failed' },
    { from: 'failed', to: 'pending' }, // Retry

    // Void (unpaid only - pending, processing, or failed)
    { from: ['pending', 'processing', 'failed'], to: 'voided' },

    // Reversal (paid only)
    { from: 'paid', to: 'reversed' },

    // Restore voided (back to pending for re-processing)
    { from: 'voided', to: 'pending' },
  ],
  terminal: ['reversed'], // Only reversed is truly terminal
});

export type PayrollStatusState = typeof PayrollStatusMachine.states[number];

// ============================================================================
// Tax Withholding Status
// ============================================================================

/**
 * TaxStatus state machine
 *
 * State diagram:
 * ```
 * PENDING ──┬──> SUBMITTED ──> PAID
 *           │
 *           └──> CANCELLED
 * ```
 *
 * - PENDING: Tax withheld, not yet submitted to government
 * - SUBMITTED: Submitted to tax authority, awaiting confirmation
 * - PAID: Payment confirmed by tax authority
 * - CANCELLED: Invalidated (payroll voided/reversed)
 */
export const TaxStatusMachine = createStateMachine({
  states: ['pending', 'submitted', 'paid', 'cancelled'] as const,
  initial: 'pending',
  transitions: [
    { from: 'pending', to: 'submitted' },
    { from: 'submitted', to: 'paid' },

    // Direct payment (some jurisdictions)
    { from: 'pending', to: 'paid' },

    // Cancellation (from any non-terminal state)
    { from: ['pending', 'submitted'], to: 'cancelled' },
  ],
  terminal: ['paid', 'cancelled'],
});

export type TaxStatusState = typeof TaxStatusMachine.states[number];

// ============================================================================
// Leave Request Status
// ============================================================================

/**
 * LeaveRequestStatus state machine
 *
 * State diagram:
 * ```
 * PENDING ──┬──> APPROVED
 *           │
 *           ├──> REJECTED
 *           │
 *           └──> CANCELLED
 * ```
 */
export const LeaveRequestStatusMachine = createStateMachine({
  states: ['pending', 'approved', 'rejected', 'cancelled'] as const,
  initial: 'pending',
  transitions: [
    { from: 'pending', to: 'approved' },
    { from: 'pending', to: 'rejected' },
    { from: 'pending', to: 'cancelled' },

    // Cancel approved leave (before it starts)
    { from: 'approved', to: 'cancelled' },
  ],
  terminal: ['rejected', 'cancelled'],
});

export type LeaveRequestStatusState = typeof LeaveRequestStatusMachine.states[number];

// ============================================================================
// Employee Status
// ============================================================================

/**
 * EmployeeStatus state machine
 *
 * State diagram:
 * ```
 * ACTIVE ←──┬──→ ON_LEAVE
 *           │
 *           ├──→ SUSPENDED ──→ ACTIVE
 *           │
 *           └──→ TERMINATED
 * ```
 */
export const EmployeeStatusMachine = createStateMachine({
  states: ['active', 'on_leave', 'suspended', 'terminated'] as const,
  initial: 'active',
  transitions: [
    // Leave management
    { from: 'active', to: 'on_leave' },
    { from: 'on_leave', to: 'active' },

    // Suspension
    { from: ['active', 'on_leave'], to: 'suspended' },
    { from: 'suspended', to: 'active' },

    // Termination (from any state)
    { from: ['active', 'on_leave', 'suspended'], to: 'terminated' },

    // Re-hire (back to active)
    { from: 'terminated', to: 'active' },
  ],
  terminal: [], // No terminal states (re-hire possible)
});

export type EmployeeStatusState = typeof EmployeeStatusMachine.states[number];

// ============================================================================
// Exports
// ============================================================================

export {
  StateMachine,
  createStateMachine,
  type StateMachineConfig,
  type StateTransition,
  type TransitionResult,
} from './state-machine.js';
