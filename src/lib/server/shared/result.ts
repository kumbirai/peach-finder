export type ValidationIssue = { path: string; message: string };

export type UseCaseError =
	| { kind: 'not_found'; resource: string }
	| { kind: 'forbidden'; reason: string }
	| { kind: 'conflict'; reason: string }
	| { kind: 'validation_failed'; issues: ValidationIssue[] }
	| { kind: 'rate_limited'; retryAfterSeconds: number }
	| { kind: 'unavailable'; dependency: string }
	| { kind: 'precondition_failed'; reason: string };

export type Result<T, E = UseCaseError> = { ok: true; value: T } | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
