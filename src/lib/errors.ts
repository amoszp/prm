import type { AppError, Result } from '@/types';

export function makeError(message: string, code = 'UNKNOWN'): AppError {
  return { message, code, timestamp: new Date().toISOString() };
}

export function toAppError(err: unknown): AppError {
  if (err instanceof Error) return makeError(err.message, err.name.toUpperCase());
  return makeError('An unexpected error occurred.');
}

/** Run an async operation and wrap its outcome in a Result. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}
