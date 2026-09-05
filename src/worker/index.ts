import PgBoss from 'pg-boss';
import { databaseUrl } from '../lib/server/env';
import { getDb } from '../lib/server/db';
import { bootApp, tickConfigRefresh } from '../lib/server/boot';
import { deadLetter, markProcessed } from '../lib/server/shared/outbox';
import { cleanupRateLimitBuckets } from '../lib/server/shared/rate-limit';
import { handleConfigChanged } from '../lib/server/modules/platform-configuration';
import {
	handleEmailVerified,
	handleAccountDeletionRequested,
	handleUserBlocked as handleMessagingUserBlocked,
	handleUserUnblocked as handleMessagingUserUnblocked
} from '../lib/server/modules/direct-messaging';
import { handleMediaProcessed, handleMediaRemoved } from '../lib/server/modules/provider-profile';
import { startTrialOnPublish } from '../lib/server/modules/listing-billing';
import { upsertSearchProjection } from '../lib/server/modules/discovery-search';
import {
	refreshSearchDisplayName,
	refreshSearchProjection,
	mirrorAvailabilityOnProjection
} from '../lib/server/modules/discovery-search/infra/projection-handlers';
import {
	handleUserBlocked as handleDiscoveryUserBlocked,
	handleUserUnblocked as handleDiscoveryUserUnblocked
} from '../lib/server/modules/discovery-search/infra/subscriptions';
import { anonymizePendingUsers } from '../lib/server/modules/identity-and-access';
import {
	handleBadgeFlagEvent,
	handleIdentityAttributesChanged
} from '../lib/server/modules/trust-and-safety';
import { runAvailabilityLifecycleTick } from '../lib/server/modules/provider-availability';
import {
	handleAvailabilityExpiryWarned,
	handleMessageSent,
	flushDueNotificationBatchWindows,
	handleUserBlocked as handleNotifUserBlocked,
	handleUserUnblocked as handleNotifUserUnblocked,
	handleUserRegistered,
	handleVerificationDecided,
	handleReviewSubmitted,
	handleReportFiled,
	handleReportResolved,
	handleModerationActionTaken,
	handlePaymentSucceeded,
	handlePaymentFailed,
	handleGraceEntered,
	handleListingLapsed,
	dispatchTrialEndingReminders
} from '../lib/server/modules/user-notifications';
import { log } from '../lib/server/shared/logger';
import { dispatchUndispatched, type OutboxJob } from './dispatch';

const QUEUE = 'outbox-subscriber';
const MAX_ATTEMPTS = 5;

async function handleJob(job: { data: OutboxJob; retrycount?: number }): Promise<void> {
	const { event, subscriber } = job.data;
	const db = getDb();
	try {
		if (
			subscriber === 'platform-configuration.config-cache' &&
			event.eventName === 'ConfigChanged'
		) {
			const payload = event.payload as { configKey: string };
			await handleConfigChanged(payload, db);
		}
		if (subscriber === 'direct-messaging.release-held' && event.eventName === 'EmailVerified') {
			await handleEmailVerified(db, event as never);
		}
		if (
			subscriber === 'direct-messaging.mark-deleted-account' &&
			event.eventName === 'AccountDeletionRequested'
		) {
			await handleAccountDeletionRequested(db, event as never);
		}
		if (subscriber === 'direct-messaging.block-cache' && event.eventName === 'UserBlocked') {
			await handleMessagingUserBlocked(db, event as never);
		}
		if (subscriber === 'direct-messaging.unblock-cache' && event.eventName === 'UserUnblocked') {
			await handleMessagingUserUnblocked(db, event as never);
		}
		if (subscriber === 'discovery-search.exclude-blocker' && event.eventName === 'UserBlocked') {
			await handleDiscoveryUserBlocked(db, event as never);
		}
		if (subscriber === 'discovery-search.include-blocker' && event.eventName === 'UserUnblocked') {
			await handleDiscoveryUserUnblocked(db, event as never);
		}
		if (subscriber === 'provider-profile.attach-photo' && event.eventName === 'MediaProcessed') {
			await handleMediaProcessed(db, event as never);
		}
		if (subscriber === 'provider-profile.detach-photo' && event.eventName === 'MediaRemoved') {
			await handleMediaRemoved(db, event as never);
		}
		if (subscriber === 'listing-billing.start-trial' && event.eventName === 'ProviderPublished') {
			const payload = event.payload as { providerProfileId: string };
			await db.transaction(async (tx) => {
				await startTrialOnPublish(
					tx,
					payload.providerProfileId as never,
					event.correlationId,
					new Date(event.occurredAt)
				);
			});
		}
		if (
			subscriber === 'discovery-search.projection-upsert' &&
			event.eventName === 'ProviderPublished'
		) {
			const payload = event.payload as { providerProfileId: string };
			await db.transaction(async (tx) => {
				await upsertSearchProjection(
					tx,
					payload.providerProfileId as never,
					new Date(event.occurredAt)
				);
			});
		}
		if (
			subscriber === 'discovery-search.projection-upsert' &&
			(event.eventName === 'AvailabilitySet' ||
				event.eventName === 'AvailabilityCleared' ||
				event.eventName === 'AvailabilityExpired')
		) {
			const payload = event.payload as { providerProfileId: string; setAt?: string };
			await db.transaction(async (tx) => {
				const inserted = await markProcessed(tx, event.eventId, subscriber);
				if (!inserted) return;

				if (event.eventName === 'AvailabilitySet' && payload.setAt) {
					const setAt = new Date(payload.setAt);
					await mirrorAvailabilityOnProjection(
						tx,
						payload.providerProfileId as never,
						'available',
						setAt,
						new Date(event.occurredAt)
					);
					return;
				}

				await mirrorAvailabilityOnProjection(
					tx,
					payload.providerProfileId as never,
					'not_available',
					null,
					new Date(event.occurredAt)
				);
			});
		}
		if (
			subscriber === 'discovery-search.projection-refresh' &&
			(event.eventName === 'ProfileUpdated' ||
				event.eventName === 'PhotoAdded' ||
				event.eventName === 'PhotoRemoved' ||
				event.eventName === 'MediaProcessed' ||
				event.eventName === 'MediaRemoved')
		) {
			const payload = event.payload as { providerProfileId: string };
			await db.transaction(async (tx) => {
				await refreshSearchProjection(
					tx,
					payload.providerProfileId as never,
					new Date(event.occurredAt)
				);
			});
		}
		if (
			subscriber === 'discovery-search.name-refresh' &&
			event.eventName === 'IdentityAttributesChanged'
		) {
			const payload = event.payload as { userId: string };
			await db.transaction(async (tx) => {
				await refreshSearchDisplayName(tx, payload.userId, new Date(event.occurredAt));
			});
		}
		if (
			subscriber === 'trust-and-safety.badge-suppress' &&
			event.eventName === 'IdentityAttributesChanged'
		) {
			await handleIdentityAttributesChanged(db, event as never);
		}
		if (
			subscriber === 'user-notifications.renewal-prompt' &&
			event.eventName === 'AvailabilityExpiryWarned'
		) {
			await handleAvailabilityExpiryWarned(db, event as never);
		}
		if (subscriber === 'user-notifications.new-message' && event.eventName === 'MessageSent') {
			await handleMessageSent(db, event as never);
		}
		if (subscriber === 'user-notifications.block-silence' && event.eventName === 'UserBlocked') {
			await handleNotifUserBlocked(db, event as never);
		}
		if (subscriber === 'user-notifications.unblock-cache' && event.eventName === 'UserUnblocked') {
			await handleNotifUserUnblocked(db, event as never);
		}
		if (subscriber === 'user-notifications.welcome' && event.eventName === 'UserRegistered') {
			await handleUserRegistered(db, event as never);
		}
		if (
			subscriber === 'user-notifications.verification-outcome' &&
			event.eventName === 'VerificationDecided'
		) {
			await handleVerificationDecided(db, event as never);
		}
		if (
			subscriber === 'user-notifications.review-submitted' &&
			event.eventName === 'ReviewSubmitted'
		) {
			await handleReviewSubmitted(db, event as never);
		}
		if (subscriber === 'user-notifications.report-receipt' && event.eventName === 'ReportFiled') {
			await handleReportFiled(db, event as never);
		}
		if (
			subscriber === 'user-notifications.report-resolved' &&
			event.eventName === 'ReportResolved'
		) {
			await handleReportResolved(db, event as never);
		}
		if (
			subscriber === 'user-notifications.moderation-notice' &&
			event.eventName === 'ModerationActionTaken'
		) {
			await handleModerationActionTaken(db, event as never);
		}
		if (subscriber === 'user-notifications.billing' && event.eventName === 'PaymentSucceeded') {
			await handlePaymentSucceeded(db, event as never);
		}
		if (subscriber === 'user-notifications.billing' && event.eventName === 'PaymentFailed') {
			await handlePaymentFailed(db, event as never);
		}
		if (subscriber === 'user-notifications.dunning' && event.eventName === 'GraceEntered') {
			await handleGraceEntered(db, event as never);
		}
		if (subscriber === 'user-notifications.lapsed-notice' && event.eventName === 'ListingLapsed') {
			await handleListingLapsed(db, event as never);
		}
		if (
			subscriber === 'discovery-search.badge-flag' &&
			(event.eventName === 'BadgeGranted' || event.eventName === 'BadgeRevoked')
		) {
			await handleBadgeFlagEvent(db, event as never);
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'unknown';
		if ((job.retrycount ?? 0) >= MAX_ATTEMPTS - 1) {
			await deadLetter(
				db,
				{
					eventId: event.eventId,
					eventName: event.eventName,
					version: 1,
					occurredAt: new Date(event.occurredAt),
					correlationId: event.correlationId,
					payload: event.payload,
					publishedAt: new Date(event.occurredAt),
					attemptCount: MAX_ATTEMPTS
				},
				subscriber,
				reason
			);
		}
		throw error;
	}
}

const boss = new PgBoss({ connectionString: databaseUrl() });
await boss.start();
await boss.createQueue(QUEUE);
await boss.work(QUEUE, async (jobs) => {
	const list = Array.isArray(jobs) ? jobs : [jobs];
	for (const job of list) {
		await handleJob(job as never);
	}
});

await bootApp();

let lastAvailabilityTickAt = 0;

setInterval(() => {
	void (async () => {
		const db = getDb();
		await dispatchUndispatched(db, async (payload) => {
			await boss.send(QUEUE, payload, { retryLimit: MAX_ATTEMPTS - 1 });
		});
		await cleanupRateLimitBuckets(db, new Date());
		await anonymizePendingUsers(db, new Date());
		await tickConfigRefresh();

		const nowMs = Date.now();
		if (nowMs - lastAvailabilityTickAt >= 60_000) {
			lastAvailabilityTickAt = nowMs;
			const now = new Date();
			await runAvailabilityLifecycleTick(db, now, `availability-tick-${now.toISOString()}`);
			await flushDueNotificationBatchWindows(db, now);
			await dispatchTrialEndingReminders(db, now);
		}
	})().catch((error: unknown) => {
		log('error', 'worker tick failed', {
			err: error instanceof Error ? error.message : 'unknown'
		});
	});
}, 15_000).unref();

log('info', 'worker started');
