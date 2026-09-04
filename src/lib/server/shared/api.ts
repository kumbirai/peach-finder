import type { UseCaseError, ValidationIssue } from './result';
import { ERROR_CODES, type ErrorCode } from './event-catalog';

export type SuccessEnvelope<T> = {
	data: T;
	meta?: { nextCursor: string | null } & Record<string, string | number | null>;
};

export type ErrorEnvelope = {
	error: {
		code: ErrorCode;
		message: string;
		fields: ValidationIssue[] | null;
	};
};

export function success<T>(data: T, meta?: SuccessEnvelope<T>['meta']): SuccessEnvelope<T> {
	return meta ? { data, meta } : { data };
}

export function useCaseErrorToHttp(error: UseCaseError): { status: number; body: ErrorEnvelope } {
	switch (error.kind) {
		case 'not_found':
			return {
				status: 404,
				body: {
					error: {
						code: ERROR_CODES.NOT_FOUND,
						message: 'We could not find that.',
						fields: null
					}
				}
			};
		case 'forbidden':
			return {
				status: 403,
				body: {
					error: {
						code: ERROR_CODES.FORBIDDEN,
						message: 'You cannot do that.',
						fields: null
					}
				}
			};
		case 'conflict':
			return {
				status: 409,
				body: {
					error: {
						code: ERROR_CODES.CONFLICT,
						message: friendlyOr(error.reason, 'That change could not be saved.'),
						fields: null
					}
				}
			};
		case 'validation_failed':
			return {
				status: 422,
				body: {
					error: {
						code: ERROR_CODES.VALIDATION_FAILED,
						message: 'Please fix the highlighted fields.',
						fields: error.issues
					}
				}
			};
		case 'rate_limited':
			return {
				status: 429,
				body: {
					error: {
						code: ERROR_CODES.RATE_LIMITED,
						message: 'Too many attempts. Try again in a moment.',
						fields: null
					}
				}
			};
		case 'unavailable':
			return {
				status: 503,
				body: {
					error: {
						code: ERROR_CODES.UNAVAILABLE,
						message: 'A service we need is temporarily unavailable. Try again shortly.',
						fields: null
					}
				}
			};
		case 'precondition_failed':
			return {
				status: 412,
				body: {
					error: {
						code: ERROR_CODES.PRECONDITION_FAILED,
						message: friendlyOr(error.reason, 'That is not available yet.'),
						fields: null
					}
				}
			};
	}
}

export function unauthenticatedHttp(): { status: number; body: ErrorEnvelope } {
	return {
		status: 401,
		body: {
			error: {
				code: ERROR_CODES.UNAUTHENTICATED,
				message: 'Please sign in to continue.',
				fields: null
			}
		}
	};
}

export function internalHttp(): { status: number; body: ErrorEnvelope } {
	return {
		status: 500,
		body: {
			error: {
				code: ERROR_CODES.INTERNAL,
				message: 'Something went wrong. Please try again.',
				fields: null
			}
		}
	};
}

export function encodeCursor(payload: Record<string, string | number>): string {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, string | number> | null {
	try {
		const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		return parsed as Record<string, string | number>;
	} catch {
		return null;
	}
}

function friendlyOr(reason: string, fallback: string): string {
	if (reason.includes(' ') && !reason.includes('_')) return reason;
	return fallback;
}
