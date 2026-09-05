import type { Database } from '../../../db';
import {
	asDomainEvent,
	claimUndispatched,
	markDispatched,
	subscribersFor,
	type UndispatchedOutboxRow
} from '../../../shared/outbox';
import { handleAvailabilityExpiryWarned } from './notification-commands';
import { handleMessageSent } from './message-sent-handler';
import { handleUserBlocked, handleUserUnblocked } from './subscriptions';
import {
	handleUserRegistered,
	handleVerificationDecided,
	handleReviewSubmitted,
	handleReportFiled,
	handleReportResolved,
	handleModerationActionTaken,
	handlePaymentSucceeded,
	handlePaymentFailed,
	handleGraceEntered,
	handleListingLapsed
} from './event-handlers';

const NOTIF_SUBSCRIBER_PREFIX = 'user-notifications.';

async function dispatchNotificationSubscriber(
	db: Database,
	subscriber: string,
	row: UndispatchedOutboxRow
): Promise<void> {
	const event = asDomainEvent(row) as never;
	if (subscriber === 'user-notifications.welcome' && row.eventName === 'UserRegistered') {
		await handleUserRegistered(db, event);
	}
	if (
		subscriber === 'user-notifications.renewal-prompt' &&
		row.eventName === 'AvailabilityExpiryWarned'
	) {
		await handleAvailabilityExpiryWarned(db, event);
	}
	if (subscriber === 'user-notifications.new-message' && row.eventName === 'MessageSent') {
		await handleMessageSent(db, event);
	}
	if (
		subscriber === 'user-notifications.verification-outcome' &&
		row.eventName === 'VerificationDecided'
	) {
		await handleVerificationDecided(db, event);
	}
	if (subscriber === 'user-notifications.review-submitted' && row.eventName === 'ReviewSubmitted') {
		await handleReviewSubmitted(db, event);
	}
	if (subscriber === 'user-notifications.report-receipt' && row.eventName === 'ReportFiled') {
		await handleReportFiled(db, event);
	}
	if (subscriber === 'user-notifications.report-resolved' && row.eventName === 'ReportResolved') {
		await handleReportResolved(db, event);
	}
	if (
		subscriber === 'user-notifications.moderation-notice' &&
		row.eventName === 'ModerationActionTaken'
	) {
		await handleModerationActionTaken(db, event);
	}
	if (subscriber === 'user-notifications.billing' && row.eventName === 'PaymentSucceeded') {
		await handlePaymentSucceeded(db, event);
	}
	if (subscriber === 'user-notifications.billing' && row.eventName === 'PaymentFailed') {
		await handlePaymentFailed(db, event);
	}
	if (subscriber === 'user-notifications.dunning' && row.eventName === 'GraceEntered') {
		await handleGraceEntered(db, event);
	}
	if (subscriber === 'user-notifications.lapsed-notice' && row.eventName === 'ListingLapsed') {
		await handleListingLapsed(db, event);
	}
	if (subscriber === 'user-notifications.block-silence' && row.eventName === 'UserBlocked') {
		await handleUserBlocked(db, event);
	}
	if (subscriber === 'user-notifications.unblock-cache' && row.eventName === 'UserUnblocked') {
		await handleUserUnblocked(db, event);
	}
}

export async function dispatchUndispatchedNotificationSubscribers(
	db: Database,
	limit = 50
): Promise<number> {
	let totalHandled = 0;

	for (let round = 0; round < 10; round++) {
		const rows = await claimUndispatched(db, limit);
		if (rows.length === 0) break;

		let roundHandled = 0;
		for (const row of rows) {
			const allSubscribers = subscribersFor(row.eventName);
			const notifSubscribers = allSubscribers.filter((name) =>
				name.startsWith(NOTIF_SUBSCRIBER_PREFIX)
			);
			if (notifSubscribers.length === 0) continue;

			for (const subscriber of notifSubscribers) {
				await dispatchNotificationSubscriber(db, subscriber, row);
			}

			const notificationOnlyEvent = allSubscribers.every((name) =>
				name.startsWith(NOTIF_SUBSCRIBER_PREFIX)
			);
			if (!notificationOnlyEvent) continue;

			await markDispatched(db, row.eventId);
			roundHandled += 1;
		}

		totalHandled += roundHandled;
		if (roundHandled === 0) break;
	}

	return totalHandled;
}
