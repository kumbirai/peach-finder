export type ProviderBillingStatusView = {
	state: string;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	headline: string;
	endDateLabel: string | null;
	whatHappensNext: string;
	listingPriceLabel: string;
	gracePeriodDays: number;
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
	gracePeriodDays: number;
	listingPriceCents: number;
}): ProviderBillingStatusView | null {
	if (input.state !== 'free_listed' || !input.trialEndsAt) {
		return null;
	}

	const endDateLabel = formatBillingDate(input.trialEndsAt);
	const listingPriceLabel = formatListingPrice(input.listingPriceCents);
	const graceDays = input.gracePeriodDays;

	return {
		state: input.state,
		trialStartedAt: input.trialStartedAt,
		trialEndsAt: input.trialEndsAt,
		headline: 'Free listing period',
		endDateLabel,
		whatHappensNext: `When your free period ends on ${endDateLabel}, you enter a ${graceDays}-day grace period to add billing (${listingPriceLabel}/month) before your profile is hidden from search. Your photos, services, and reviews stay saved — you can republish any time after paying.`,
		listingPriceLabel,
		gracePeriodDays: graceDays
	};
}
