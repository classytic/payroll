/**
 * @classytic/payroll - Result Type
 *
 * Rust-inspired Result type for type-safe error handling
 * No more try/catch everywhere - explicit error handling
 */

// ============================================================================
// Result Type Definition
// ============================================================================

/** Success result */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Error result */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Result type - either success or error */
export type Result<T, E = Error> = Ok<T> | Err<E>;

// ============================================================================
// Constructors
// ============================================================================

/**
 * Create a success result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create an error result
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if result is success
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Check if result is error
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

// ============================================================================
// Unwrap Functions
// ============================================================================

/**
 * Unwrap result value or throw error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap result value or return default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Unwrap result value or compute default
 */
export function unwrapOrElse<T, E>(
  result: Result<T, E>,
  fn: (error: E) => T
): T {
  if (isOk(result)) {
    return result.value;
  }
  return fn(result.error);
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Map success value
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map error value
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * FlatMap (chain) success value
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Try/catch wrapper for async functions
 */
export async function tryCatch<T, E = Error>(
  fn: () => Promise<T>,
  errorTransform?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    if (errorTransform) {
      return err(errorTransform(error));
    }
    return err(error as E);
  }
}

/**
 * Try/catch wrapper for sync functions
 */
export function tryCatchSync<T, E = Error>(
  fn: () => T,
  errorTransform?: (error: unknown) => E
): Result<T, E> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    if (errorTransform) {
      return err(errorTransform(error));
    }
    return err(error as E);
  }
}

/**
 * Combine multiple results into one
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/**
 * Pattern match on result
 */
export function match<T, E, R>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => R;
    err: (error: E) => R;
  }
): R {
  if (isOk(result)) {
    return handlers.ok(result.value);
  }
  return handlers.err(result.error);
}

/**
 * Convert Promise<Result> to Result<Promise>
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  errorTransform?: (error: unknown) => E
): Promise<Result<T, E>> {
  return tryCatch(() => promise, errorTransform);
}

/**
 * Create Result from nullable value
 */
export function fromNullable<T, E>(
  value: T | null | undefined,
  error: E
): Result<T, E> {
  if (value === null || value === undefined) {
    return err(error);
  }
  return ok(value);
}

// ============================================================================
// Result Class (OOP Alternative)
// ============================================================================

export class ResultClass<T, E = Error> {
  private constructor(private readonly result: Result<T, E>) {}

  static ok<T>(value: T): ResultClass<T, never> {
    return new ResultClass(ok(value));
  }

  static err<E>(error: E): ResultClass<never, E> {
    return new ResultClass(err(error));
  }

  static async fromAsync<T, E = Error>(
    fn: () => Promise<T>,
    errorTransform?: (error: unknown) => E
  ): Promise<ResultClass<T, E>> {
    const result = await tryCatch(fn, errorTransform);
    return new ResultClass(result);
  }

  isOk(): boolean {
    return isOk(this.result);
  }

  isErr(): boolean {
    return isErr(this.result);
  }

  unwrap(): T {
    return unwrap(this.result);
  }

  unwrapOr(defaultValue: T): T {
    return unwrapOr(this.result, defaultValue);
  }

  map<U>(fn: (value: T) => U): ResultClass<U, E> {
    return new ResultClass(map(this.result, fn));
  }

  mapErr<F>(fn: (error: E) => F): ResultClass<T, F> {
    return new ResultClass(mapErr(this.result, fn));
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): ResultClass<U, E> {
    return new ResultClass(flatMap(this.result, fn));
  }

  match<R>(handlers: { ok: (value: T) => R; err: (error: E) => R }): R {
    return match(this.result, handlers);
  }

  toResult(): Result<T, E> {
    return this.result;
  }
}

// ============================================================================
// Alias for convenience
// ============================================================================

export const Result = {
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
};

