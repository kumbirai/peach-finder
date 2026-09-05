import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { getProfileOwnerIdDb } from '../../provider-profile';
import { reviews } from '../../provider-reviews/infra/schema';
import { listings } from '../../listing-billing/infra/schema';
import { reports } from '../../trust-and-safety/infra/schema';
import type { DomainEvent } from '../../../shared/events';
import { type ProviderProfileId, type ReviewId, type UserId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { isNotifBlockedBetween } from './block-cache';
import { recordNotification } from './dispatch';
import { notificationLog } from './schema';

type HandlerContext = {
	db: Database;
	event: DomainEvent;
	subscriber: string;
};

async function withIdempotentDispatch(
	ctx: HandlerContext,
	work: (tx: import('../../../db').Transaction, now: Date) => Promise<void>
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, ctx.event.eventId, ctx.subscriber);
		if (!inserted) return;
		await work(tx, new Date(ctx.event.occurredAt));
	});
}

export async function handleUserRegistered(
	db: Database,
	event: DomainEvent<'UserRegistered', { userId: string; registrationIntent: string }>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.welcome' },
		async (tx, now) => {
			await recordNotification(tx, {
				userId: event.payload.userId as UserId,
				category: 'account_welcome',
				channels: ['email'],
				title: 'Welcome to Peach Finder',
				body: 'Your account is ready. Browse available therapists or finish setting up your provider profile.',
				deepLinkPath:
					event.payload.registrationIntent === 'provider' ? '/provider/onboarding' : '/',
				relatedEntityType: 'user',
				relatedEntityId: event.payload.userId,
				correlationId: event.correlationId,
				now
			});
		}
	);
}

export async function handleVerificationDecided(
	db: Database,
	event: DomainEvent<
		'VerificationDecided',
		{ verificationCaseId: string; providerProfileId: string; decision: string }
	>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.verification-outcome' },
		async (tx, now) => {
			const ownerId = await getProfileOwnerIdDb(
				tx,
				event.payload.providerProfileId as ProviderProfileId
			);
			if (!ownerId) return;

			const approved = event.payload.decision === 'approved';
			await recordNotification(tx, {
				userId: ownerId,
				category: 'identity_outcome',
				channels: ['email', 'in_app'],
				title: approved ? 'Identity verified' : 'Identity verification update',
				body: approved
					? 'Your identity badge is now live on your profile.'
					: 'We could not verify your identity this time. Open your dashboard for next steps.',
				deepLinkPath: '/provider/dashboard',
				relatedEntityType: 'verification_case',
				relatedEntityId: event.payload.verificationCaseId,
				correlationId: event.correlationId,
				now
			});
		}
	);
}

export async function handleReviewSubmitted(
	db: Database,
	event: DomainEvent<
		'ReviewSubmitted',
		{ reviewId: string; providerProfileId: string; rating: number }
	>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.review-submitted' },
		async (tx, now) => {
			const ownerId = await getProfileOwnerIdDb(
				tx,
				event.payload.providerProfileId as ProviderProfileId
			);
			if (!ownerId) return;

			const reviewRows = await tx
				.select({ reviewerId: reviews.reviewerId })
				.from(reviews)
				.where(eq(reviews.id, event.payload.reviewId as ReviewId))
				.limit(1);
			const reviewerId = reviewRows[0]?.reviewerId as UserId | undefined;
			if (reviewerId && (await isNotifBlockedBetween(tx, reviewerId, ownerId))) {
				return;
			}

			await recordNotification(tx, {
				userId: ownerId,
				category: 'review_received',
				channels: ['email', 'in_app'],
				title: 'New review on your profile',
				body: `You received a ${event.payload.rating}-star review. Open your profile to read it.`,
				deepLinkPath: `/provider/dashboard`,
				relatedEntityType: 'review',
				relatedEntityId: event.payload.reviewId,
				correlationId: event.correlationId,
				now
			});
		}
	);
}

export async function handleReportFiled(
	db: Database,
	event: DomainEvent<
		'ReportFiled',
		{ reportId: string; reporterId: string; targetType: string; targetId: string }
	>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.report-receipt' },
		async (tx, now) => {
			await recordNotification(tx, {
				userId: event.payload.reporterId as UserId,
				category: 'report_receipt',
				channels: ['in_app'],
				title: 'Report received',
				body: 'Thanks — we received your report and will review it.',
				deepLinkPath: '/account',
				relatedEntityType: 'report',
				relatedEntityId: event.payload.reportId,
				correlationId: event.correlationId,
				now
			});
		}
	);
}

export async function handleReportResolved(
	db: Database,
	event: DomainEvent<'ReportResolved', { reportId: string; resolution: string }>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.report-resolved' },
		async (tx, now) => {
			const reportRows = await tx
				.select({ reporterId: reports.reporterId })
				.from(reports)
				.where(eq(reports.id, event.payload.reportId as never))
				.limit(1);
			const reporterId = reportRows[0]?.reporterId as UserId | undefined;
			if (!reporterId) return;

			const acted = event.payload.resolution === 'acted';
			await recordNotification(tx, {
				userId: reporterId,
				category: 'report_resolution',
				channels: ['in_app'],
				title: acted ? 'Report reviewed' : 'Report closed',
				body: acted
					? 'We reviewed your report and took action.'
					: 'We reviewed your report and closed it without further action.',
				deepLinkPath: '/account',
				relatedEntityType: 'report',
				relatedEntityId: event.payload.reportId,
				correlationId: event.correlationId,
				now
			});
		}
	);
}

function moderationCopy(action: string, reason?: string): { title: string; body: string } {
	const reasonSuffix = reason ? ` Reason: ${reason}` : '';
	switch (action) {
		case 'suspend':
			return {
				title: 'Account suspended',
				body: `Your account has been suspended.${reasonSuffix}`
			};
		case 'unpublish':
			return {
				title: 'Profile unpublished',
				body: `Your profile was unpublished by our team.${reasonSuffix}`
			};
		case 'remove_photo':
			return {
				title: 'Photo removed',
				body: `A photo was removed from your profile.${reasonSuffix}`
			};
		case 'remove_review':
			return {
				title: 'Review removed',
				body: `A review on your profile was removed.${reasonSuffix}`
			};
		case 'reinstate':
			return {
				title: 'Account reinstated',
				body: 'Your account access has been restored.'
			};
		default:
			return {
				title: 'Moderation update',
				body: `A moderation action was taken on your account.${reasonSuffix}`
			};
	}
}

export async function handleModerationActionTaken(
	db: Database,
	event: DomainEvent<
		'ModerationActionTaken',
		{
			moderationActionId: string;
			targetType: string;
			targetId: string;
			action: string;
			reason?: string;
		}
	>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.moderation-notice' },
		async (tx, now) => {
			let userId: UserId | null = null;
			if (event.payload.targetType === 'provider_profile') {
				userId = await getProfileOwnerIdDb(tx, event.payload.targetId as ProviderProfileId);
			} else if (event.payload.targetType === 'user') {
				userId = event.payload.targetId as UserId;
			}
			if (!userId) return;

			const copy = moderationCopy(event.payload.action, event.payload.reason);
			await recordNotification(tx, {
				userId,
				category: 'moderation_outcome',
				channels: ['email', 'in_app'],
				title: copy.title,
				body: copy.body,
				deepLinkPath: '/provider/dashboard',
				relatedEntityType: event.payload.targetType,
				relatedEntityId: event.payload.targetId,
				correlationId: event.correlationId,
				now
			});
		}
	);
}

async function notifyBillingOwner(
	tx: import('../../../db').Transaction,
	providerProfileId: string,
	category: string,
	channels: readonly ('in_app' | 'email')[],
	title: string,
	body: string,
	deepLinkPath: string,
	relatedEntityType: string,
	relatedEntityId: string,
	correlationId: string,
	now: Date
): Promise<void> {
	const ownerId = await getProfileOwnerIdDb(tx, providerProfileId as ProviderProfileId);
	if (!ownerId) return;
	await recordNotification(tx, {
		userId: ownerId,
		category,
		channels,
		title,
		body,
		deepLinkPath,
		relatedEntityType,
		relatedEntityId,
		correlationId,
		now
	});
}

export async function handlePaymentSucceeded(
	db: Database,
	event: DomainEvent<
		'PaymentSucceeded',
		{ subscriptionId: string; invoiceId: string; amount: number }
	>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.billing' },
		async (tx, now) => {
			const profileId = await profileIdForSubscription(tx, event.payload.subscriptionId);
			if (!profileId) return;
			await notifyBillingOwner(
				tx,
				profileId,
				'billing_payment',
				['email', 'in_app'],
				'Payment received',
				'Your listing payment was successful. Thank you.',
				'/provider/billing',
				'subscription',
				event.payload.subscriptionId,
				event.correlationId,
				now
			);
		}
	);
}

export async function handlePaymentFailed(
	db: Database,
	event: DomainEvent<'PaymentFailed', { subscriptionId: string; invoiceId: string; amount: number }>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.billing' },
		async (tx, now) => {
			const profileId = await profileIdForSubscription(tx, event.payload.subscriptionId);
			if (!profileId) return;
			await notifyBillingOwner(
				tx,
				profileId,
				'billing_payment',
				['email', 'in_app'],
				'Payment failed',
				'We could not process your listing payment. Update your payment method to stay published.',
				'/provider/billing',
				'subscription',
				event.payload.subscriptionId,
				event.correlationId,
				now
			);
		}
	);
}

export async function handleGraceEntered(
	db: Database,
	event: DomainEvent<'GraceEntered', { subscriptionId: string; graceEndsAt: string }>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.dunning' },
		async (tx, now) => {
			const profileId = await profileIdForSubscription(tx, event.payload.subscriptionId);
			if (!profileId) return;
			const graceLabel = new Date(event.payload.graceEndsAt).toLocaleDateString();
			await notifyBillingOwner(
				tx,
				profileId,
				'billing_grace',
				['email', 'in_app'],
				'Grace period started',
				`Your listing is in a grace period until ${graceLabel}. Update billing to avoid being unpublished.`,
				'/provider/billing',
				'subscription',
				event.payload.subscriptionId,
				event.correlationId,
				now
			);
		}
	);
}

export async function handleListingLapsed(
	db: Database,
	event: DomainEvent<'ListingLapsed', { subscriptionId: string; providerProfileId: string }>
): Promise<void> {
	await withIdempotentDispatch(
		{ db, event, subscriber: 'user-notifications.lapsed-notice' },
		async (tx, now) => {
			await notifyBillingOwner(
				tx,
				event.payload.providerProfileId,
				'billing_unpublished',
				['email', 'in_app'],
				'Listing unpublished',
				'Your profile was unpublished after the grace period ended. Pay anytime to republish instantly.',
				'/provider/billing',
				'subscription',
				event.payload.subscriptionId,
				event.correlationId,
				now
			);
		}
	);
}

async function profileIdForSubscription(
	tx: import('../../../db').Transaction,
	subscriptionId: string
): Promise<string | null> {
	const rows = await tx
		.select({ providerProfileId: listings.providerProfileId })
		.from(listings)
		.where(eq(listings.providerProfileId, subscriptionId))
		.limit(1);
	return rows[0]?.providerProfileId ?? subscriptionId;
}

export async function dispatchTrialEndingReminders(db: Database, now: Date): Promise<number> {
	const reminderDays = 3;
	const horizon = new Date(now);
	horizon.setUTCDate(horizon.getUTCDate() + reminderDays);

	const dueRows = await db
		.select({
			providerProfileId: listings.providerProfileId,
			trialEndsAt: listings.trialEndsAt
		})
		.from(listings)
		.where(eq(listings.state, 'free_listed'));

	let sent = 0;
	for (const row of dueRows) {
		if (!row.trialEndsAt || row.trialEndsAt > horizon || row.trialEndsAt <= now) {
			continue;
		}
		const ownerId = await getProfileOwnerIdDb(db, row.providerProfileId as ProviderProfileId);
		if (!ownerId) continue;

		const correlationId = `trial-ending-${row.providerProfileId}-${row.trialEndsAt.toISOString()}`;
		const existing = await db
			.select({ id: notificationLog.id })
			.from(notificationLog)
			.where(
				and(
					eq(notificationLog.correlationId, correlationId),
					eq(notificationLog.category, 'billing_trial_ending')
				)
			)
			.limit(1);
		if (existing.length > 0) continue;

		const endsLabel = row.trialEndsAt.toLocaleDateString();
		await db.transaction(async (tx) => {
			await recordNotification(tx, {
				userId: ownerId,
				category: 'billing_trial_ending',
				channels: ['email', 'in_app'],
				title: 'Free trial ending soon',
				body: `Your free listing trial ends on ${endsLabel}. Add a payment method to stay published.`,
				deepLinkPath: '/provider/billing',
				relatedEntityType: 'subscription',
				relatedEntityId: row.providerProfileId,
				correlationId,
				now
			});
		});
		sent += 1;
	}
	return sent;
}
