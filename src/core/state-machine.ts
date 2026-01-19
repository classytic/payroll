/**
 * @classytic/payroll - State Machine
 *
 * Minimal state machine implementation for status management.
 * Enforces valid transitions and provides clear error messages.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * State transition definition
 */
export interface StateTransition<TState extends string> {
  from: TState | TState[];
  to: TState;
}

/**
 * State machine configuration
 */
export interface StateMachineConfig<TState extends string> {
  /** All valid states */
  states: readonly TState[];
  /** Initial state */
  initial: TState;
  /** Valid transitions */
  transitions: StateTransition<TState>[];
  /** Terminal states (no outgoing transitions) */
  terminal?: TState[];
}

/**
 * Transition result
 */
export type TransitionResult<TState extends string> =
  | { success: true; from: TState; to: TState }
  | { success: false; from: TState; to: TState; error: string };

// ============================================================================
// State Machine Class
// ============================================================================

/**
 * Minimal state machine for status management
 *
 * @example
 * const machine = new StateMachine({
 *   states: ['pending', 'processing', 'paid', 'voided'] as const,
 *   initial: 'pending',
 *   transitions: [
 *     { from: 'pending', to: 'processing' },
 *     { from: 'pending', to: 'voided' },
 *     { from: 'processing', to: 'paid' },
 *   ],
 *   terminal: ['paid', 'voided'],
 * });
 *
 * machine.canTransition('pending', 'processing'); // true
 * machine.canTransition('paid', 'pending'); // false
 */
export class StateMachine<TState extends string> {
  private readonly validTransitions: Map<TState, Set<TState>>;
  private readonly terminalStates: Set<TState>;

  constructor(private readonly config: StateMachineConfig<TState>) {
    // Build transition map for O(1) lookup
    this.validTransitions = new Map();
    for (const state of config.states) {
      this.validTransitions.set(state, new Set());
    }

    for (const transition of config.transitions) {
      const fromStates = Array.isArray(transition.from)
        ? transition.from
        : [transition.from];

      for (const from of fromStates) {
        this.validTransitions.get(from)?.add(transition.to);
      }
    }

    this.terminalStates = new Set(config.terminal || []);
  }

  /**
   * Get the initial state
   */
  get initial(): TState {
    return this.config.initial;
  }

  /**
   * Get all valid states
   */
  get states(): readonly TState[] {
    return this.config.states;
  }

  /**
   * Check if a state is valid
   */
  isValidState(state: string): state is TState {
    return this.config.states.includes(state as TState);
  }

  /**
   * Check if a state is terminal (no outgoing transitions)
   */
  isTerminal(state: TState): boolean {
    return this.terminalStates.has(state);
  }

  /**
   * Check if transition from one state to another is valid
   */
  canTransition(from: TState, to: TState): boolean {
    return this.validTransitions.get(from)?.has(to) ?? false;
  }

  /**
   * Get all valid next states from current state
   */
  getNextStates(from: TState): TState[] {
    return Array.from(this.validTransitions.get(from) || []);
  }

  /**
   * Validate a transition and return result
   */
  validateTransition(from: TState, to: TState): TransitionResult<TState> {
    if (!this.isValidState(from)) {
      return {
        success: false,
        from,
        to,
        error: `Invalid current state: '${from}'`,
      };
    }

    if (!this.isValidState(to)) {
      return {
        success: false,
        from,
        to,
        error: `Invalid target state: '${to}'`,
      };
    }

    if (this.isTerminal(from)) {
      return {
        success: false,
        from,
        to,
        error: `Cannot transition from terminal state '${from}'`,
      };
    }

    if (!this.canTransition(from, to)) {
      const validNext = this.getNextStates(from);
      return {
        success: false,
        from,
        to,
        error: `Invalid transition: '${from}' → '${to}'. Valid transitions from '${from}': [${validNext.join(', ')}]`,
      };
    }

    return { success: true, from, to };
  }

  /**
   * Assert a transition is valid, throw if not
   */
  assertTransition(from: TState, to: TState): void {
    const result = this.validateTransition(from, to);
    if (!result.success) {
      throw new Error(result.error);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a state machine instance
 */
export function createStateMachine<TState extends string>(
  config: StateMachineConfig<TState>
): StateMachine<TState> {
  return new StateMachine(config);
}
