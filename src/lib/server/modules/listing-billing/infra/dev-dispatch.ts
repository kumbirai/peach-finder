import type { Database } from '../../../db';
import {
	asDomainEvent,
	claimUndispatched,
	markDispatched,
	subscribersFor,
	type UndispatchedOutboxRow
} from '../../../shared/outbox';
import {
	handleListingLapsedProjectionRemove,
	handleFeaturingActivated,
	handleFeaturingLapsed
} from '../../discovery-search';
import {
	handleBillingListingLapsed,
	handleRepublishAfterBillingLapse
} from '../../provider-profile';
import {
	handleGraceEntered,
	handleListingLapsed,
	handlePaymentFailed,
	handlePaymentSucceeded
} from '../../user-notifications';

async function dispatchRowSubscribers(db: Database, row: UndispatchedOutboxRow): Promise<void> {
	const event = asDomainEvent(row) as never;
	for (const subscriber of subscribersFor(row.eventName)) {
		if (subscriber === 'provider-profile.auto-unpublish' && row.eventName === 'ListingLapsed') {
			await db.transaction(async (tx) => {
				await handleBillingListingLapsed(tx, event, new Date(row.occurredAt));
			});
		}
		if (subscriber === 'discovery-search.projection-remove' && row.eventName === 'ListingLapsed') {
			await db.transaction(async (tx) => {
				await handleListingLapsedProjectionRemove(tx, event);
			});
		}
		if (
			subscriber === 'provider-profile.republish-after-lapse' &&
			row.eventName === 'PaymentSucceeded'
		) {
			await db.transaction(async (tx) => {
				await handleRepublishAfterBillingLapse(tx, event, new Date(row.occurredAt));
			});
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
		if (subscriber === 'discovery-search.featuring' && row.eventName === 'FeaturingActivated') {
			await db.transaction(async (tx) => {
				await handleFeaturingActivated(tx, event, new Date(row.occurredAt));
			});
		}
		if (subscriber === 'discovery-search.featuring' && row.eventName === 'FeaturingLapsed') {
			await db.transaction(async (tx) => {
				await handleFeaturingLapsed(tx, event, new Date(row.occurredAt));
			});
		}
	}
}

export async function dispatchUndispatchedBillingSubscribers(
	db: Database,
	limit = 50
): Promise<number> {
	let totalHandled = 0;

	for (let round = 0; round < 10; round++) {
		const rows = await claimUndispatched(db, limit);
		if (rows.length === 0) break;

		for (const row of rows) {
			const relevant = subscribersFor(row.eventName).some((subscriber) =>
				[
					'provider-profile.auto-unpublish',
					'provider-profile.republish-after-lapse',
					'discovery-search.projection-remove',
					'discovery-search.featuring',
					'user-notifications.billing',
					'user-notifications.dunning',
					'user-notifications.lapsed-notice'
				].includes(subscriber)
			);
			if (!relevant) continue;

			await dispatchRowSubscribers(db, row);
			await markDispatched(db, row.eventId);
			totalHandled += 1;
		}

		if (rows.length < limit) break;
	}

	return totalHandled;
}
