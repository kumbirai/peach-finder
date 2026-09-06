export type ListingState = 'building' | 'free_listed' | 'paid_listed' | 'grace' | 'unpublished';

export type ListingTransition =
	| 'free_listed_to_grace'
	| 'paid_listed_to_grace'
	| 'grace_to_unpublished'
	| 'payment_from_free_listed'
	| 'payment_from_paid_listed'
	| 'payment_from_grace'
	| 'payment_from_unpublished';

export function addDaysUtc(from: Date, days: number): Date {
	const result = new Date(from);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

export function addMonthsUtc(from: Date, months: number): Date {
	const result = new Date(from);
	result.setUTCMonth(result.getUTCMonth() + months);
	return result;
}

export function graceEndsAt(now: Date, gracePeriodDays: number): Date {
	return addDaysUtc(now, gracePeriodDays);
}

export function paidPeriodEndsAt(now: Date): Date {
	return addMonthsUtc(now, 1);
}

export function resolvePaymentTransition(currentState: string): ListingTransition | null {
	switch (currentState) {
		case 'free_listed':
			return 'payment_from_free_listed';
		case 'paid_listed':
			return 'payment_from_paid_listed';
		case 'grace':
			return 'payment_from_grace';
		case 'unpublished':
			return 'payment_from_unpublished';
		default:
			return null;
	}
}

export function resolveFailedPaymentTransition(
	currentState: string
): 'paid_listed_to_grace' | null {
	return currentState === 'paid_listed' ? 'paid_listed_to_grace' : null;
}

export function dayInGrace(graceEndsAt: Date, gracePeriodDays: number, now: Date): number {
	const graceStart = addDaysUtc(graceEndsAt, -gracePeriodDays);
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.floor((now.getTime() - graceStart.getTime()) / msPerDay) + 1;
}

export function emitsSubscriptionActivated(transition: ListingTransition): boolean {
	return (
		transition === 'payment_from_free_listed' ||
		transition === 'payment_from_grace' ||
		transition === 'payment_from_unpublished'
	);
}
