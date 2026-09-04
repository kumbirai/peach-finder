import type { Role } from '../shared/auth-context';
import { unauthenticatedHttp, useCaseErrorToHttp, type ErrorEnvelope } from '../shared/api';

export type RbacDecision = {
	forbidden: boolean;
	unauthenticated: boolean;
};

export function rbacFailure(
	decision: RbacDecision
): { status: number; body: ErrorEnvelope } | null {
	if (decision.unauthenticated) {
		return unauthenticatedHttp();
	}
	if (decision.forbidden) {
		return useCaseErrorToHttp({ kind: 'forbidden', reason: 'insufficient role' });
	}
	return null;
}

export type { Role };
