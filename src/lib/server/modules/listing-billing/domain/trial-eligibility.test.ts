import { describe, expect, it } from 'vitest';
import {
	inferResumedListingState,
	isResumablePriorListing,
	resolveTrialStartPlan
} from './trial-eligibility';

describe('trial-eligibility domain', () => {
	const now = new Date('2026-09-05T12:00:00.000Z');

	it('grants a new trial when the phone has not been used before', () => {
		const plan = resolveTrialStartPlan({
			phoneReuse: false,
			priorListing: null,
			now,
			trialPeriodDays: 14
		});

		expect(plan.kind).toBe('new_trial');
		if (plan.kind !== 'new_trial') return;
		expect(plan.billingContinuity).toBe('new');
		expect(plan.trialEndsAt.toISOString()).toBe('2026-09-19T12:00:00.000Z');
	});

	it('resumes prior listing state when phone was reused and a prior subscription exists', () => {
		const priorTrialEndsAt = new Date('2026-09-10T12:00:00.000Z');
		const plan = resolveTrialStartPlan({
			phoneReuse: true,
			priorListing: {
				providerProfileId: 'prior-profile',
				state: 'free_listed',
				trialStartedAt: new Date('2026-08-01T12:00:00.000Z'),
				trialEndsAt: priorTrialEndsAt,
				graceEndsAt: null
			},
			now,
			trialPeriodDays: 14
		});

		expect(plan.kind).toBe('resume');
		if (plan.kind !== 'resume') return;
		expect(plan.billingContinuity).toBe('resumed');
		expect(plan.trialEndsAt).toEqual(priorTrialEndsAt);
		expect(plan.state).toBe('free_listed');
	});

	it('requires payment when phone was reused but no prior subscription is findable', () => {
		const plan = resolveTrialStartPlan({
			phoneReuse: true,
			priorListing: null,
			now,
			trialPeriodDays: 14
		});

		expect(plan.kind).toBe('payment_required');
		if (plan.kind !== 'payment_required') return;
		expect(plan.billingContinuity).toBe('no_trial');
		expect(plan.graceEndsAt).toEqual(now);
	});

	it('infers free_listed when a cancelled prior row still has trial time remaining', () => {
		const priorTrialEndsAt = new Date('2026-09-19T12:00:00.000Z');
		const plan = resolveTrialStartPlan({
			phoneReuse: true,
			priorListing: {
				providerProfileId: 'prior-profile',
				state: 'cancelled',
				trialStartedAt: new Date('2026-09-05T12:00:00.000Z'),
				trialEndsAt: priorTrialEndsAt,
				graceEndsAt: null
			},
			now,
			trialPeriodDays: 14
		});

		expect(plan.kind).toBe('resume');
		if (plan.kind !== 'resume') return;
		expect(plan.state).toBe('free_listed');
		expect(plan.trialEndsAt).toEqual(priorTrialEndsAt);
	});

	it('infers unpublished when a cancelled prior row has an expired grace window', () => {
		const plan = resolveTrialStartPlan({
			phoneReuse: true,
			priorListing: {
				providerProfileId: 'prior-profile',
				state: 'cancelled',
				trialStartedAt: new Date('2026-08-01T12:00:00.000Z'),
				trialEndsAt: new Date('2026-09-01T12:00:00.000Z'),
				graceEndsAt: new Date('2026-09-04T12:00:00.000Z')
			},
			now,
			trialPeriodDays: 14
		});

		expect(plan.kind).toBe('resume');
		if (plan.kind !== 'resume') return;
		expect(plan.state).toBe('unpublished');
	});

	it('does not treat a cancelled building row without trial history as resumable', () => {
		expect(
			isResumablePriorListing({
				providerProfileId: 'prior-profile',
				state: 'cancelled',
				trialStartedAt: null,
				trialEndsAt: null,
				graceEndsAt: null
			})
		).toBe(false);

		const plan = resolveTrialStartPlan({
			phoneReuse: true,
			priorListing: null,
			now,
			trialPeriodDays: 14
		});

		expect(plan.kind).toBe('payment_required');
	});
});
