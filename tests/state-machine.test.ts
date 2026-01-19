/**
 * State Machine Tests
 *
 * Comprehensive tests for all status state machines
 */

import { describe, it, expect } from 'vitest';
import {
  StateMachine,
  createStateMachine,
  PayrollStatusMachine,
  TaxStatusMachine,
  LeaveRequestStatusMachine,
  EmployeeStatusMachine,
} from '../src/core/payroll-states.js';

// ============================================================================
// StateMachine Core Tests
// ============================================================================

describe('StateMachine', () => {
  const simpleMachine = createStateMachine({
    states: ['a', 'b', 'c'] as const,
    initial: 'a',
    transitions: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
    terminal: ['c'],
  });

  describe('basic functionality', () => {
    it('should have correct initial state', () => {
      expect(simpleMachine.initial).toBe('a');
    });

    it('should list all states', () => {
      expect(simpleMachine.states).toEqual(['a', 'b', 'c']);
    });

    it('should validate states', () => {
      expect(simpleMachine.isValidState('a')).toBe(true);
      expect(simpleMachine.isValidState('b')).toBe(true);
      expect(simpleMachine.isValidState('invalid')).toBe(false);
    });

    it('should identify terminal states', () => {
      expect(simpleMachine.isTerminal('c')).toBe(true);
      expect(simpleMachine.isTerminal('a')).toBe(false);
      expect(simpleMachine.isTerminal('b')).toBe(false);
    });
  });

  describe('transitions', () => {
    it('should allow valid transitions', () => {
      expect(simpleMachine.canTransition('a', 'b')).toBe(true);
      expect(simpleMachine.canTransition('b', 'c')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(simpleMachine.canTransition('a', 'c')).toBe(false); // Skip not allowed
      expect(simpleMachine.canTransition('b', 'a')).toBe(false); // Reverse not allowed
      expect(simpleMachine.canTransition('c', 'a')).toBe(false); // From terminal
    });

    it('should get valid next states', () => {
      expect(simpleMachine.getNextStates('a')).toEqual(['b']);
      expect(simpleMachine.getNextStates('b')).toEqual(['c']);
      expect(simpleMachine.getNextStates('c')).toEqual([]); // Terminal
    });
  });

  describe('validateTransition', () => {
    it('should return success for valid transitions', () => {
      const result = simpleMachine.validateTransition('a', 'b');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.from).toBe('a');
        expect(result.to).toBe('b');
      }
    });

    it('should return error for invalid transitions', () => {
      const result = simpleMachine.validateTransition('a', 'c');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid transition');
        expect(result.error).toContain("'a' → 'c'");
      }
    });

    it('should return error for terminal state transitions', () => {
      const result = simpleMachine.validateTransition('c', 'a');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('terminal state');
      }
    });

    it('should return error for invalid states', () => {
      const result = simpleMachine.validateTransition('invalid' as any, 'a');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid current state');
      }
    });
  });

  describe('assertTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => simpleMachine.assertTransition('a', 'b')).not.toThrow();
    });

    it('should throw for invalid transitions', () => {
      expect(() => simpleMachine.assertTransition('a', 'c')).toThrow(/Invalid transition/);
    });
  });

  describe('array from syntax', () => {
    const multiFromMachine = createStateMachine({
      states: ['x', 'y', 'z'] as const,
      initial: 'x',
      transitions: [
        { from: ['x', 'y'], to: 'z' }, // Both x and y can go to z
      ],
      terminal: ['z'],
    });

    it('should allow transitions from multiple source states', () => {
      expect(multiFromMachine.canTransition('x', 'z')).toBe(true);
      expect(multiFromMachine.canTransition('y', 'z')).toBe(true);
    });
  });
});

// ============================================================================
// PayrollStatusMachine Tests
// ============================================================================

describe('PayrollStatusMachine', () => {
  describe('states', () => {
    it('should have all expected states', () => {
      expect(PayrollStatusMachine.states).toContain('pending');
      expect(PayrollStatusMachine.states).toContain('processing');
      expect(PayrollStatusMachine.states).toContain('paid');
      expect(PayrollStatusMachine.states).toContain('failed');
      expect(PayrollStatusMachine.states).toContain('voided');
      expect(PayrollStatusMachine.states).toContain('reversed');
    });

    it('should have pending as initial state', () => {
      expect(PayrollStatusMachine.initial).toBe('pending');
    });

    it('should have reversed as only terminal state', () => {
      expect(PayrollStatusMachine.isTerminal('reversed')).toBe(true);
      expect(PayrollStatusMachine.isTerminal('voided')).toBe(false);
      expect(PayrollStatusMachine.isTerminal('paid')).toBe(false);
    });
  });

  describe('normal flow transitions', () => {
    it('should allow pending → processing', () => {
      expect(PayrollStatusMachine.canTransition('pending', 'processing')).toBe(true);
    });

    it('should allow processing → paid', () => {
      expect(PayrollStatusMachine.canTransition('processing', 'paid')).toBe(true);
    });

    it('should allow pending → paid (direct payment)', () => {
      expect(PayrollStatusMachine.canTransition('pending', 'paid')).toBe(true);
    });
  });

  describe('failure handling transitions', () => {
    it('should allow processing → failed', () => {
      expect(PayrollStatusMachine.canTransition('processing', 'failed')).toBe(true);
    });

    it('should allow failed → pending (retry)', () => {
      expect(PayrollStatusMachine.canTransition('failed', 'pending')).toBe(true);
    });
  });

  describe('void transitions', () => {
    it('should allow pending → voided', () => {
      expect(PayrollStatusMachine.canTransition('pending', 'voided')).toBe(true);
    });

    it('should allow processing → voided', () => {
      expect(PayrollStatusMachine.canTransition('processing', 'voided')).toBe(true);
    });

    it('should allow failed → voided', () => {
      expect(PayrollStatusMachine.canTransition('failed', 'voided')).toBe(true);
    });

    it('should NOT allow paid → voided', () => {
      expect(PayrollStatusMachine.canTransition('paid', 'voided')).toBe(false);
    });
  });

  describe('reversal transitions', () => {
    it('should allow paid → reversed', () => {
      expect(PayrollStatusMachine.canTransition('paid', 'reversed')).toBe(true);
    });

    it('should NOT allow pending → reversed', () => {
      expect(PayrollStatusMachine.canTransition('pending', 'reversed')).toBe(false);
    });

    it('should NOT allow voided → reversed', () => {
      expect(PayrollStatusMachine.canTransition('voided', 'reversed')).toBe(false);
    });
  });

  describe('restore transitions', () => {
    it('should allow voided → pending (restore)', () => {
      expect(PayrollStatusMachine.canTransition('voided', 'pending')).toBe(true);
    });

    it('should NOT allow reversed → pending (no restore from reversed)', () => {
      expect(PayrollStatusMachine.canTransition('reversed', 'pending')).toBe(false);
    });
  });

  describe('invalid transitions', () => {
    it('should NOT allow paid → pending', () => {
      expect(PayrollStatusMachine.canTransition('paid', 'pending')).toBe(false);
    });

    it('should NOT allow reversed → anything', () => {
      expect(PayrollStatusMachine.canTransition('reversed', 'pending')).toBe(false);
      expect(PayrollStatusMachine.canTransition('reversed', 'paid')).toBe(false);
      expect(PayrollStatusMachine.canTransition('reversed', 'voided')).toBe(false);
    });
  });

  describe('complete workflows', () => {
    it('should support normal payment workflow', () => {
      // pending → processing → paid
      expect(PayrollStatusMachine.canTransition('pending', 'processing')).toBe(true);
      expect(PayrollStatusMachine.canTransition('processing', 'paid')).toBe(true);
    });

    it('should support void workflow', () => {
      // pending → voided → pending (restore)
      expect(PayrollStatusMachine.canTransition('pending', 'voided')).toBe(true);
      expect(PayrollStatusMachine.canTransition('voided', 'pending')).toBe(true);
    });

    it('should support reversal workflow', () => {
      // pending → paid → reversed
      expect(PayrollStatusMachine.canTransition('pending', 'paid')).toBe(true);
      expect(PayrollStatusMachine.canTransition('paid', 'reversed')).toBe(true);
    });

    it('should support retry workflow', () => {
      // pending → processing → failed → pending → paid
      expect(PayrollStatusMachine.canTransition('pending', 'processing')).toBe(true);
      expect(PayrollStatusMachine.canTransition('processing', 'failed')).toBe(true);
      expect(PayrollStatusMachine.canTransition('failed', 'pending')).toBe(true);
      expect(PayrollStatusMachine.canTransition('pending', 'paid')).toBe(true);
    });
  });
});

// ============================================================================
// TaxStatusMachine Tests
// ============================================================================

describe('TaxStatusMachine', () => {
  describe('states', () => {
    it('should have all expected states', () => {
      expect(TaxStatusMachine.states).toContain('pending');
      expect(TaxStatusMachine.states).toContain('submitted');
      expect(TaxStatusMachine.states).toContain('paid');
      expect(TaxStatusMachine.states).toContain('cancelled');
    });

    it('should have pending as initial state', () => {
      expect(TaxStatusMachine.initial).toBe('pending');
    });

    it('should have paid and cancelled as terminal states', () => {
      expect(TaxStatusMachine.isTerminal('paid')).toBe(true);
      expect(TaxStatusMachine.isTerminal('cancelled')).toBe(true);
      expect(TaxStatusMachine.isTerminal('pending')).toBe(false);
      expect(TaxStatusMachine.isTerminal('submitted')).toBe(false);
    });
  });

  describe('transitions', () => {
    it('should allow pending → submitted', () => {
      expect(TaxStatusMachine.canTransition('pending', 'submitted')).toBe(true);
    });

    it('should allow submitted → paid', () => {
      expect(TaxStatusMachine.canTransition('submitted', 'paid')).toBe(true);
    });

    it('should allow pending → paid (direct)', () => {
      expect(TaxStatusMachine.canTransition('pending', 'paid')).toBe(true);
    });

    it('should allow pending → cancelled', () => {
      expect(TaxStatusMachine.canTransition('pending', 'cancelled')).toBe(true);
    });

    it('should allow submitted → cancelled', () => {
      expect(TaxStatusMachine.canTransition('submitted', 'cancelled')).toBe(true);
    });

    it('should NOT allow paid → cancelled', () => {
      expect(TaxStatusMachine.canTransition('paid', 'cancelled')).toBe(false);
    });

    it('should NOT allow cancelled → anything', () => {
      expect(TaxStatusMachine.canTransition('cancelled', 'pending')).toBe(false);
      expect(TaxStatusMachine.canTransition('cancelled', 'paid')).toBe(false);
    });
  });
});

// ============================================================================
// LeaveRequestStatusMachine Tests
// ============================================================================

describe('LeaveRequestStatusMachine', () => {
  describe('states', () => {
    it('should have all expected states', () => {
      expect(LeaveRequestStatusMachine.states).toContain('pending');
      expect(LeaveRequestStatusMachine.states).toContain('approved');
      expect(LeaveRequestStatusMachine.states).toContain('rejected');
      expect(LeaveRequestStatusMachine.states).toContain('cancelled');
    });

    it('should have pending as initial state', () => {
      expect(LeaveRequestStatusMachine.initial).toBe('pending');
    });

    it('should have rejected and cancelled as terminal states', () => {
      expect(LeaveRequestStatusMachine.isTerminal('rejected')).toBe(true);
      expect(LeaveRequestStatusMachine.isTerminal('cancelled')).toBe(true);
      expect(LeaveRequestStatusMachine.isTerminal('approved')).toBe(false);
      expect(LeaveRequestStatusMachine.isTerminal('pending')).toBe(false);
    });
  });

  describe('transitions', () => {
    it('should allow pending → approved', () => {
      expect(LeaveRequestStatusMachine.canTransition('pending', 'approved')).toBe(true);
    });

    it('should allow pending → rejected', () => {
      expect(LeaveRequestStatusMachine.canTransition('pending', 'rejected')).toBe(true);
    });

    it('should allow pending → cancelled', () => {
      expect(LeaveRequestStatusMachine.canTransition('pending', 'cancelled')).toBe(true);
    });

    it('should allow approved → cancelled (cancel before leave starts)', () => {
      expect(LeaveRequestStatusMachine.canTransition('approved', 'cancelled')).toBe(true);
    });

    it('should NOT allow rejected → anything', () => {
      expect(LeaveRequestStatusMachine.canTransition('rejected', 'approved')).toBe(false);
      expect(LeaveRequestStatusMachine.canTransition('rejected', 'pending')).toBe(false);
    });

    it('should NOT allow approved → rejected', () => {
      expect(LeaveRequestStatusMachine.canTransition('approved', 'rejected')).toBe(false);
    });
  });
});

// ============================================================================
// EmployeeStatusMachine Tests
// ============================================================================

describe('EmployeeStatusMachine', () => {
  describe('states', () => {
    it('should have all expected states', () => {
      expect(EmployeeStatusMachine.states).toContain('active');
      expect(EmployeeStatusMachine.states).toContain('on_leave');
      expect(EmployeeStatusMachine.states).toContain('suspended');
      expect(EmployeeStatusMachine.states).toContain('terminated');
    });

    it('should have active as initial state', () => {
      expect(EmployeeStatusMachine.initial).toBe('active');
    });

    it('should have no terminal states (re-hire possible)', () => {
      expect(EmployeeStatusMachine.isTerminal('terminated')).toBe(false);
      expect(EmployeeStatusMachine.isTerminal('active')).toBe(false);
    });
  });

  describe('leave transitions', () => {
    it('should allow active → on_leave', () => {
      expect(EmployeeStatusMachine.canTransition('active', 'on_leave')).toBe(true);
    });

    it('should allow on_leave → active', () => {
      expect(EmployeeStatusMachine.canTransition('on_leave', 'active')).toBe(true);
    });
  });

  describe('suspension transitions', () => {
    it('should allow active → suspended', () => {
      expect(EmployeeStatusMachine.canTransition('active', 'suspended')).toBe(true);
    });

    it('should allow on_leave → suspended', () => {
      expect(EmployeeStatusMachine.canTransition('on_leave', 'suspended')).toBe(true);
    });

    it('should allow suspended → active', () => {
      expect(EmployeeStatusMachine.canTransition('suspended', 'active')).toBe(true);
    });
  });

  describe('termination transitions', () => {
    it('should allow active → terminated', () => {
      expect(EmployeeStatusMachine.canTransition('active', 'terminated')).toBe(true);
    });

    it('should allow on_leave → terminated', () => {
      expect(EmployeeStatusMachine.canTransition('on_leave', 'terminated')).toBe(true);
    });

    it('should allow suspended → terminated', () => {
      expect(EmployeeStatusMachine.canTransition('suspended', 'terminated')).toBe(true);
    });
  });

  describe('re-hire transitions', () => {
    it('should allow terminated → active (re-hire)', () => {
      expect(EmployeeStatusMachine.canTransition('terminated', 'active')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('should NOT allow suspended → on_leave', () => {
      expect(EmployeeStatusMachine.canTransition('suspended', 'on_leave')).toBe(false);
    });

    it('should NOT allow terminated → on_leave', () => {
      expect(EmployeeStatusMachine.canTransition('terminated', 'on_leave')).toBe(false);
    });
  });
});
