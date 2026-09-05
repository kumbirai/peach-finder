import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId, newId } from '../../shared/ids';
import { asInstant } from '../../shared/clock';
import type { DomainEvent } from '../../shared/events';
import { sendOrHoldMessage } from '../direct-messaging';
import { listings } from '../listing-billing/infra/schema';
import { reviews } from '../provider-reviews/infra/schema';
import { reports } from '../trust-and-safety/infra/schema';
import { users } from '../identity-and-access/infra/schema';
import {
	handleAvailabilityExpiryWarned,
	handleMessageSent,
	handleUserRegistered,
	handleVerificationDecided,
	handleReviewSubmitted,
	handleReportFiled,
	handleReportResolved,
	handleModerationActionTaken,
	handlePaymentFailed,
	handleGraceEntered,
	handleListingLapsed,
	dispatchTrialEndingReminders
} from './index';
import { notificationLog } from './infra/schema';

const PROVIDER_OWNER_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
const PRIMARY_PROFILE_ID = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

function event<T extends DomainEvent['eventName'], P>(
	name: T,
	payload: P,
	correlationId: string
): DomainEvent<T, P> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: name,
		version: 1,
		occurredAt: asInstant('2026-09-05T14:00:00Z'),
		correlationId,
		payload
	};
}

async function channelsForCategory(
	db: import('../../db').Database,
	userId: string,
	category: string
): Promise<string[]> {
	const rows = await db
		.select({ channel: notificationLog.channel })
		.from(notificationLog)
		.where(and(eq(notificationLog.userId, userId), eq(notificationLog.category, category)));
	return rows.map((row) => row.channel).sort();
}

describe('US-NOTIF-01 baseline event set integration', () => {
	it('TC-NOTIF-01a: every baseline event dispatches on its correct channel(s)', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000b501');
			await db
				.insert(users)
				.values({
					id: seekerId,
					displayName: 'Notif Seeker',
					email: 'notif-seeker@example.com',
					emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
					status: 'active'
				})
				.onConflictDoNothing();

			await handleUserRegistered(
				db,
				event('UserRegistered', { userId: seekerId, registrationIntent: 'seeker' }, 'corr-welcome')
			);
			expect(await channelsForCategory(db, seekerId, 'account_welcome')).toEqual(['email']);

			await handleAvailabilityExpiryWarned(
				db,
				event(
					'AvailabilityExpiryWarned',
					{
						providerProfileId: PRIMARY_PROFILE_ID,
						expiresAt: '2026-09-05T15:00:00Z'
					},
					'corr-avail'
				)
			);
			expect(
				await channelsForCategory(db, PROVIDER_OWNER_ID, 'availability_expiry_warning')
			).toEqual(['in_app']);

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: PRIMARY_PROFILE_ID,
				body: 'Baseline message',
				now: new Date('2026-09-05T14:00:00Z'),
				correlationId: 'corr-msg'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('message send failed');
			await handleMessageSent(
				db,
				event(
					'MessageSent',
					{
						threadId: sent.value.threadId,
						messageId: sent.value.messageId,
						senderId: seekerId
					},
					'corr-msg'
				)
			);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'new_message')).toEqual(['in_app']);

			await handleVerificationDecided(
				db,
				event(
					'VerificationDecided',
					{
						verificationCaseId: newId(),
						providerProfileId: PRIMARY_PROFILE_ID,
						decision: 'approved'
					},
					'corr-verify'
				)
			);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'identity_outcome')).toEqual([
				'email',
				'in_app'
			]);

			const reviewId = newId<'ReviewId'>();
			await db.insert(reviews).values({
				id: reviewId,
				providerProfileId: PRIMARY_PROFILE_ID,
				reviewerId: seekerId,
				rating: 5,
				body: 'Great session',
				createdAt: new Date('2026-09-05T14:00:00Z')
			});
			await handleReviewSubmitted(
				db,
				event(
					'ReviewSubmitted',
					{ reviewId, providerProfileId: PRIMARY_PROFILE_ID, rating: 5 },
					'corr-review'
				)
			);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'review_received')).toEqual([
				'email',
				'in_app'
			]);

			const reportId = newId<'ReportId'>();
			await db.insert(reports).values({
				id: reportId,
				reporterId: seekerId,
				targetType: 'profile',
				targetId: PRIMARY_PROFILE_ID,
				reason: 'spam_scam',
				status: 'open',
				createdAt: new Date('2026-09-05T14:00:00Z')
			});
			await handleReportFiled(
				db,
				event(
					'ReportFiled',
					{
						reportId,
						reporterId: seekerId,
						targetType: 'profile',
						targetId: PRIMARY_PROFILE_ID
					},
					'corr-report'
				)
			);
			expect(await channelsForCategory(db, seekerId, 'report_receipt')).toEqual(['in_app']);

			await handleReportResolved(
				db,
				event('ReportResolved', { reportId, resolution: 'acted' }, 'corr-report-resolved')
			);
			expect(await channelsForCategory(db, seekerId, 'report_resolution')).toEqual(['in_app']);

			await handleModerationActionTaken(
				db,
				event(
					'ModerationActionTaken',
					{
						moderationActionId: newId(),
						targetType: 'provider_profile',
						targetId: PRIMARY_PROFILE_ID,
						action: 'unpublish',
						reason: 'Policy violation'
					},
					'corr-moderation'
				)
			);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'moderation_outcome')).toEqual([
				'email',
				'in_app'
			]);

			const subscriptionId = PRIMARY_PROFILE_ID;
			await handlePaymentFailed(
				db,
				event(
					'PaymentFailed',
					{ subscriptionId, invoiceId: newId(), amount: 29900 },
					'corr-pay-fail'
				)
			);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'billing_payment')).toEqual([
				'email',
				'in_app'
			]);

			await handleGraceEntered(
				db,
				event('GraceEntered', { subscriptionId, graceEndsAt: '2026-09-12T14:00:00Z' }, 'corr-grace')
			);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'billing_grace')).toEqual([
				'email',
				'in_app'
			]);

			await handleListingLapsed(
				db,
				event(
					'ListingLapsed',
					{ subscriptionId, providerProfileId: PRIMARY_PROFILE_ID },
					'corr-lapsed'
				)
			);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'billing_unpublished')).toEqual([
				'email',
				'in_app'
			]);

			const trialEndsAt = new Date('2026-09-08T14:00:00Z');
			await db
				.update(listings)
				.set({ state: 'free_listed', trialEndsAt })
				.where(eq(listings.providerProfileId, PRIMARY_PROFILE_ID));

			const trialSent = await dispatchTrialEndingReminders(db, new Date('2026-09-05T14:00:00Z'));
			expect(trialSent).toBe(1);
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'billing_trial_ending')).toEqual([
				'email',
				'in_app'
			]);
		});
	});
});
