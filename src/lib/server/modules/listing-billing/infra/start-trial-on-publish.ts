import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { getConfig } from '../../platform-configuration';
import {
	getPhoneVerifiedAt,
	getVerifiedPhoneHash,
	wasPhoneUsedBefore
} from '../../identity-and-access/infra/phone-registry-read';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { isResumablePriorListing, resolveTrialStartPlan } from '../domain/trial-eligibility';
import { findPriorListingByPhoneRef } from './phone-history-read';
import { recordPhoneHistoryRefForOwner } from './trial-eligibility-handler';
import { listings } from './schema';

export async function startTrialOnPublish(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	ownerId: UserId,
	correlationId: string,
	now: Date
): Promise<void> {
	const rows = await tx
		.select({
			state: listings.state,
			trialStartedAt: listings.trialStartedAt
		})
		.from(listings)
		.where(eq(listings.providerProfileId, providerProfileId))
		.limit(1);

	const row = rows[0];
	if (row?.trialStartedAt != null || (row && row.state !== 'building')) {
		return;
	}

	const phoneHash = await getVerifiedPhoneHash(tx, ownerId);
	if (!phoneHash) {
		return;
	}

	const verifiedAt = await getPhoneVerifiedAt(tx, ownerId);
	if (!verifiedAt) {
		return;
	}

	const priorListingRow = await findPriorListingByPhoneRef(tx, phoneHash, providerProfileId);
	const priorListingForPlan =
		priorListingRow && isResumablePriorListing(priorListingRow) ? priorListingRow : null;
	const phoneReuse =
		priorListingForPlan != null || (await wasPhoneUsedBefore(tx, phoneHash, verifiedAt));
	const trialPeriodDays = getConfig('listing-billing.trial_period_days');
	const plan = resolveTrialStartPlan({
		phoneReuse,
		priorListing: priorListingForPlan,
		now,
		trialPeriodDays
	});

	if (plan.kind === 'new_trial') {
		if (!row) {
			await tx.insert(listings).values({
				providerProfileId,
				state: 'free_listed',
				trialStartedAt: now,
				trialEndsAt: plan.trialEndsAt,
				phoneHistoryRef: phoneHash,
				billingContinuity: plan.billingContinuity,
				updatedAt: now
			});
		} else {
			await tx
				.update(listings)
				.set({
					state: 'free_listed',
					trialStartedAt: now,
					trialEndsAt: plan.trialEndsAt,
					phoneHistoryRef: phoneHash,
					billingContinuity: plan.billingContinuity,
					updatedAt: now
				})
				.where(eq(listings.providerProfileId, providerProfileId));
		}

		await emitTrialStarted(tx, providerProfileId, correlationId, now, plan.trialEndsAt);
		return;
	}

	if (plan.kind === 'resume') {
		if (!row) {
			await tx.insert(listings).values({
				providerProfileId,
				state: plan.state,
				trialStartedAt: plan.trialStartedAt,
				trialEndsAt: plan.trialEndsAt,
				graceEndsAt: plan.graceEndsAt,
				phoneHistoryRef: phoneHash,
				billingContinuity: plan.billingContinuity,
				updatedAt: now
			});
		} else {
			await tx
				.update(listings)
				.set({
					state: plan.state,
					trialStartedAt: plan.trialStartedAt,
					trialEndsAt: plan.trialEndsAt,
					graceEndsAt: plan.graceEndsAt,
					phoneHistoryRef: phoneHash,
					billingContinuity: plan.billingContinuity,
					updatedAt: now
				})
				.where(eq(listings.providerProfileId, providerProfileId));
		}
		return;
	}

	const graceEndsAt = plan.graceEndsAt;

	if (!row) {
		await tx.insert(listings).values({
			providerProfileId,
			state: 'grace',
			graceEndsAt,
			phoneHistoryRef: phoneHash,
			billingContinuity: plan.billingContinuity,
			updatedAt: now
		});
	} else {
		await tx
			.update(listings)
			.set({
				state: 'grace',
				trialStartedAt: null,
				trialEndsAt: null,
				graceEndsAt,
				phoneHistoryRef: phoneHash,
				billingContinuity: plan.billingContinuity,
				updatedAt: now
			})
			.where(eq(listings.providerProfileId, providerProfileId));
	}
}

async function emitTrialStarted(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date,
	trialEndsAt: Date
): Promise<void> {
	const event: DomainEvent<
		'TrialStarted',
		{ providerProfileId: string; subscriptionId: string; trialEndsAt: string }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'TrialStarted',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			providerProfileId,
			subscriptionId: providerProfileId,
			trialEndsAt: trialEndsAt.toISOString()
		}
	};
	await publish(tx, event);
}

export { recordPhoneHistoryRefForOwner };
