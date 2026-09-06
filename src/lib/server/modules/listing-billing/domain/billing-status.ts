import type { BillingContinuity } from './trial-eligibility';

export type ProviderBillingStatusView = {
	state: string;
	stateChipLabel: string;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	graceEndsAt: string | null;
	headline: string;
	endDateLabel: string | null;
	endDatePrefix: string | null;
	whatHappensNext: string;
	listingPriceLabel: string;
	gracePeriodDays: number;
	billingContinuity: BillingContinuity;
};

export function formatBillingDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-ZA', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

export function formatListingPrice(cents: number): string {
	return `R${Math.round(cents / 100).toLocaleString('en-ZA')}`;
}

export function buildProviderBillingStatusView(input: {
	state: string;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	graceEndsAt: string | null;
	currentPeriodEndsAt?: string | null;
	cancelAtPeriodEnd?: boolean;
	gracePeriodDays: number;
	listingPriceCents: number;
	billingContinuity: BillingContinuity;
}): ProviderBillingStatusView | null {
	const listingPriceLabel = formatListingPrice(input.listingPriceCents);
	const graceDays = input.gracePeriodDays;

	if (input.state === 'free_listed' && input.trialEndsAt) {
		const endDateLabel = formatBillingDate(input.trialEndsAt);
		const continuityNote =
			input.billingContinuity === 'resumed'
				? ' Your listing continues from your previous account on this number.'
				: '';

		return {
			state: input.state,
			stateChipLabel: 'Active listing',
			trialStartedAt: input.trialStartedAt,
			trialEndsAt: input.trialEndsAt,
			graceEndsAt: input.graceEndsAt,
			headline: 'Free listing period',
			endDateLabel,
			endDatePrefix: 'Free period ends',
			whatHappensNext: `When your free period ends on ${endDateLabel}, you enter a ${graceDays}-day grace period to add billing (${listingPriceLabel}/month) before your profile is hidden from search. Your photos, services, and reviews stay saved — you can republish any time after paying.${continuityNote}`,
			listingPriceLabel,
			gracePeriodDays: graceDays,
			billingContinuity: input.billingContinuity
		};
	}

	if (input.state === 'paid_listed' && input.currentPeriodEndsAt) {
		const endDateLabel = formatBillingDate(input.currentPeriodEndsAt);
		return {
			state: input.state,
			stateChipLabel: 'Paid listing',
			trialStartedAt: input.trialStartedAt,
			trialEndsAt: input.trialEndsAt,
			graceEndsAt: input.graceEndsAt,
			headline: 'Listing billing',
			endDateLabel,
			endDatePrefix: input.cancelAtPeriodEnd ? 'Listing stays live until' : 'Current period ends',
			whatHappensNext: input.cancelAtPeriodEnd
				? `Renewal is cancelled. Your listing stays visible in search until ${endDateLabel}, then enters a ${graceDays}-day grace period before being hidden. Your photos, services, and reviews stay saved.`
				: `Your listing renews at ${listingPriceLabel}/month on ${endDateLabel} unless you cancel renewal.`,
			listingPriceLabel,
			gracePeriodDays: graceDays,
			billingContinuity: input.billingContinuity
		};
	}

	if (input.state === 'grace' && input.graceEndsAt) {
		const endDateLabel = formatBillingDate(input.graceEndsAt);
		const resumedLeadIn =
			input.billingContinuity === 'resumed'
				? 'Your listing billing continues from your previous account on this number. '
				: input.billingContinuity === 'no_trial'
					? 'This phone number was already used for a free listing period. '
					: '';

		return {
			state: input.state,
			stateChipLabel: 'Grace period',
			trialStartedAt: input.trialStartedAt,
			trialEndsAt: input.trialEndsAt,
			graceEndsAt: input.graceEndsAt,
			headline: 'Listing billing',
			endDateLabel,
			endDatePrefix: 'Grace period ends',
			whatHappensNext: `${resumedLeadIn}Add billing (${listingPriceLabel}/month) by ${endDateLabel} to keep your profile visible in search. Your photos, services, and reviews stay saved.`,
			listingPriceLabel,
			gracePeriodDays: graceDays,
			billingContinuity: input.billingContinuity
		};
	}

	if (input.state === 'unpublished') {
		return {
			state: input.state,
			stateChipLabel: 'Unpublished',
			trialStartedAt: input.trialStartedAt,
			trialEndsAt: input.trialEndsAt,
			graceEndsAt: input.graceEndsAt,
			headline: 'Listing billing',
			endDateLabel: null,
			endDatePrefix: null,
			whatHappensNext:
				'Your profile is hidden from search after the grace period ended. This is a billing state — not a moderation action. Pay to republish instantly with no review step. Your photos, services, and reviews stay saved.',
			listingPriceLabel,
			gracePeriodDays: graceDays,
			billingContinuity: input.billingContinuity
		};
	}

	return null;
}
