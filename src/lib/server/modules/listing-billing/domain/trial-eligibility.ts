export type BillingContinuity = 'new' | 'resumed' | 'no_trial';

export type PriorListingState = {
	providerProfileId: string;
	state: string;
	trialStartedAt: Date | null;
	trialEndsAt: Date | null;
	graceEndsAt: Date | null;
};

export type TrialStartPlan =
	| {
			kind: 'new_trial';
			billingContinuity: 'new';
			trialEndsAt: Date;
	  }
	| {
			kind: 'resume';
			billingContinuity: 'resumed';
			state: string;
			trialStartedAt: Date | null;
			trialEndsAt: Date | null;
			graceEndsAt: Date | null;
	  }
	| {
			kind: 'payment_required';
			billingContinuity: 'no_trial';
			graceEndsAt: Date;
	  };

export function isResumablePriorListing(prior: PriorListingState): boolean {
	if (prior.trialStartedAt != null) {
		return true;
	}

	return (
		prior.state === 'free_listed' ||
		prior.state === 'paid_listed' ||
		prior.state === 'grace' ||
		prior.state === 'unpublished'
	);
}

export function inferResumedListingState(prior: PriorListingState, now: Date): string {
	if (prior.trialEndsAt && prior.trialEndsAt.getTime() > now.getTime()) {
		return 'free_listed';
	}
	if (prior.graceEndsAt && prior.graceEndsAt.getTime() > now.getTime()) {
		return 'grace';
	}
	if (prior.graceEndsAt && prior.graceEndsAt.getTime() <= now.getTime()) {
		return 'unpublished';
	}
	if (prior.state === 'paid_listed' || prior.state === 'unpublished') {
		return prior.state;
	}
	return 'grace';
}

export function resolveTrialStartPlan(input: {
	phoneReuse: boolean;
	priorListing: PriorListingState | null;
	now: Date;
	trialPeriodDays: number;
}): TrialStartPlan {
	if (!input.phoneReuse) {
		const trialEndsAt = new Date(input.now);
		trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + input.trialPeriodDays);
		return {
			kind: 'new_trial',
			billingContinuity: 'new',
			trialEndsAt
		};
	}

	if (input.priorListing) {
		const resumedState = inferResumedListingState(input.priorListing, input.now);
		return {
			kind: 'resume',
			billingContinuity: 'resumed',
			state: resumedState,
			trialStartedAt: input.priorListing.trialStartedAt,
			trialEndsAt: input.priorListing.trialEndsAt,
			graceEndsAt: input.priorListing.graceEndsAt
		};
	}

	return {
		kind: 'payment_required',
		billingContinuity: 'no_trial',
		graceEndsAt: input.now
	};
}
