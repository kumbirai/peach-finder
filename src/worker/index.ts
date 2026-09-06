import PgBoss from 'pg-boss';
import { databaseUrl, publicAppOrigin } from '../lib/server/env';
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
import {
	handleMediaProcessed,
	handleMediaRemoved,
	handleProviderProfileModeration,
	handleBillingListingLapsed,
	handleRepublishAfterBillingLapse
} from '../lib/server/modules/provider-profile';
import {
	startTrialOnPublish,
	handlePhoneVerifiedForTrialEligibility,
	runBillingLifecycleTick,
	createPaymentGateway
} from '../lib/server/modules/listing-billing';
import { handleReviewsModeration } from '../lib/server/modules/provider-reviews';
import {
	handleThreadCreatedForAnalytics,
	runAnalyticsMaintenanceTick
} from '../lib/server/modules/provider-analytics';
import { handleMediaModeration } from '../lib/server/modules/media-processing';
import {
	handleModerationProjectionRemove,
	handleListingLapsedProjectionRemove,
	handleFeaturingActivated,
	handleFeaturingLapsed,
	upsertSearchProjection
} from '../lib/server/modules/discovery-search';
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
	handleIdentityAttributesChanged,
	runActiveThisWeekJob,
	runIdentityDocPurgeJob
} from '../lib/server/modules/trust-and-safety';
import { purgeDormantThreads } from '../lib/server/modules/direct-messaging';
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
import { pingHealthcheck } from '../lib/server/shared/healthcheck';
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
			const payload = event.payload as { providerProfileId: string; ownerId: string };
			await db.transaction(async (tx) => {
				await startTrialOnPublish(
					tx,
					payload.providerProfileId as never,
					payload.ownerId as never,
					event.correlationId,
					new Date(event.occurredAt)
				);
			});
		}
		if (subscriber === 'listing-billing.trial-eligibility' && event.eventName === 'PhoneVerified') {
			const payload = event.payload as { userId: string; phoneHash: string };
			await db.transaction(async (tx) => {
				await handlePhoneVerifiedForTrialEligibility(
					tx,
					payload.userId as never,
					payload.phoneHash,
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
		if (
			subscriber === 'provider-profile.moderation-effect' &&
			event.eventName === 'ModerationActionTaken'
		) {
			await handleProviderProfileModeration(db, event as never);
		}
		if (
			subscriber === 'provider-reviews.moderation-effect' &&
			event.eventName === 'ModerationActionTaken'
		) {
			await handleReviewsModeration(db, event as never);
		}
		if (
			subscriber === 'media-processing.moderation-effect' &&
			event.eventName === 'ModerationActionTaken'
		) {
			await handleMediaModeration(db, event as never);
		}
		if (
			subscriber === 'discovery-search.projection-remove' &&
			event.eventName === 'ModerationActionTaken'
		) {
			await handleModerationProjectionRemove(db, event as never);
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
		if (subscriber === 'provider-profile.auto-unpublish' && event.eventName === 'ListingLapsed') {
			await db.transaction(async (tx) => {
				await handleBillingListingLapsed(tx, event as never, new Date(event.occurredAt));
			});
		}
		if (
			subscriber === 'discovery-search.projection-remove' &&
			event.eventName === 'ListingLapsed'
		) {
			await db.transaction(async (tx) => {
				await handleListingLapsedProjectionRemove(tx, event as never);
			});
		}
		if (
			subscriber === 'provider-profile.republish-after-lapse' &&
			event.eventName === 'PaymentSucceeded'
		) {
			await db.transaction(async (tx) => {
				await handleRepublishAfterBillingLapse(tx, event as never, new Date(event.occurredAt));
			});
		}
		if (
			subscriber === 'discovery-search.badge-flag' &&
			(event.eventName === 'BadgeGranted' || event.eventName === 'BadgeRevoked')
		) {
			await handleBadgeFlagEvent(db, event as never);
		}
		if (subscriber === 'discovery-search.featuring' && event.eventName === 'FeaturingActivated') {
			await db.transaction(async (tx) => {
				await handleFeaturingActivated(tx, event as never, new Date(event.occurredAt));
			});
		}
		if (subscriber === 'discovery-search.featuring' && event.eventName === 'FeaturingLapsed') {
			await db.transaction(async (tx) => {
				await handleFeaturingLapsed(tx, event as never, new Date(event.occurredAt));
			});
		}
		if (
			subscriber === 'provider-analytics.contact-request' &&
			event.eventName === 'ThreadCreated'
		) {
			await handleThreadCreatedForAnalytics(db, event as never);
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
let lastActiveThisWeekTickAt = 0;
let lastBillingLifecycleTickAt = 0;
let lastAnalyticsMaintenanceTickAt = 0;
let lastRetentionTickAt = 0;
const ACTIVE_THIS_WEEK_TICK_MS = 24 * 60 * 60 * 1000;
const BILLING_LIFECYCLE_TICK_MS = 60 * 60 * 1000;
const ANALYTICS_MAINTENANCE_TICK_MS = 60 * 60 * 1000;
const RETENTION_TICK_MS = 24 * 60 * 60 * 1000;

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

		if (nowMs - lastActiveThisWeekTickAt >= ACTIVE_THIS_WEEK_TICK_MS) {
			lastActiveThisWeekTickAt = nowMs;
			const now = new Date();
			await runActiveThisWeekJob(db, now, `active-this-week-${now.toISOString()}`);
		}

		if (nowMs - lastBillingLifecycleTickAt >= BILLING_LIFECYCLE_TICK_MS) {
			lastBillingLifecycleTickAt = nowMs;
			const now = new Date();
			const gateway = createPaymentGateway(publicAppOrigin());
			await runBillingLifecycleTick(db, now, `billing-lifecycle-${now.toISOString()}`, gateway);
		}

		if (nowMs - lastAnalyticsMaintenanceTickAt >= ANALYTICS_MAINTENANCE_TICK_MS) {
			lastAnalyticsMaintenanceTickAt = nowMs;
			const now = new Date();
			await runAnalyticsMaintenanceTick(db, now);
		}
		if (nowMs - lastRetentionTickAt >= RETENTION_TICK_MS) {
			lastRetentionTickAt = nowMs;
			const now = new Date();
			const correlationId = `retention-${now.toISOString()}`;
			const anonymized = await anonymizePendingUsers(db, now);
			if (anonymized > 0) {
				log('info', 'account anonymization completed', { usersAnonymized: anonymized });
			}
			await pingHealthcheck('HEALTHCHECK_ACCOUNT_ANONYMIZATION');
			await runIdentityDocPurgeJob(db, now, correlationId);
			await purgeDormantThreads(db, now);
		}
	})().catch((error: unknown) => {
		log('error', 'worker tick failed', {
			err: error instanceof Error ? error.message : 'unknown'
		});
	});
}, 15_000).unref();

log('info', 'worker started');
