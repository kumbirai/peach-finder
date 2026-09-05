import type { Instant } from '../../../shared/clock';
import type { ProviderProfileId } from '../../../shared/ids';
import { Err, Ok, type Result } from '../../../shared/result';

export type AvailabilityStatus =
	| { readonly kind: 'NotAvailable'; readonly providerProfileId: ProviderProfileId }
	| {
			readonly kind: 'Available';
			readonly providerProfileId: ProviderProfileId;
			readonly setAt: Instant;
			readonly expiresAt: Instant;
	  }
	| {
			readonly kind: 'ExpiryWarned';
			readonly providerProfileId: ProviderProfileId;
			readonly setAt: Instant;
			readonly expiresAt: Instant;
			readonly warnedAt: Instant;
	  };

export function setAvailable(
	status: AvailabilityStatus,
	now: Instant,
	expiresAt: Instant
): {
	next: Extract<AvailabilityStatus, { kind: 'Available' }>;
	historyType: 'set' | 'renewed';
} {
	const historyType = status.kind === 'NotAvailable' ? 'set' : 'renewed';
	return {
		next: {
			kind: 'Available',
			providerProfileId: status.providerProfileId,
			setAt: now,
			expiresAt
		},
		historyType
	};
}

export function clear(
	status: AvailabilityStatus
): Result<{ kind: 'NotAvailable'; providerProfileId: ProviderProfileId }, { kind: 'noop' }> {
	return status.kind === 'NotAvailable'
		? Err({ kind: 'noop' })
		: Ok({ kind: 'NotAvailable', providerProfileId: status.providerProfileId });
}

export function isLiveState(status: AvailabilityStatus): boolean {
	return status.kind === 'Available' || status.kind === 'ExpiryWarned';
}

export function discoveryAvailabilityState(
	status: AvailabilityStatus
): 'available' | 'not_available' {
	if (status.kind === 'Available' || status.kind === 'ExpiryWarned') {
		return 'available';
	}
	return 'not_available';
}
