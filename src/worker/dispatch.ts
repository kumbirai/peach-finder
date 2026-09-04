import type { Database } from '../lib/server/db';
import {
	asDomainEvent,
	claimUndispatched,
	deadLetter,
	markDispatched,
	subscribersFor,
	type UndispatchedOutboxRow
} from '../lib/server/shared/outbox';

export type OutboxJob = {
	event: ReturnType<typeof asDomainEvent>;
	subscriber: string;
};

export type OutboxEnqueue = (job: OutboxJob) => Promise<void>;

const MAX_ATTEMPTS = 5;

export async function dispatchUndispatched(
	db: Database,
	enqueue: OutboxEnqueue,
	limit = 50
): Promise<UndispatchedOutboxRow[]> {
	const rows = await db.transaction(async (tx) => claimUndispatched(tx, limit));
	for (const row of rows) {
		const subs = subscribersFor(row.eventName);
		if (subs.length === 0) {
			await markDispatched(db, row.eventId);
			continue;
		}
		try {
			for (const subscriber of subs) {
				await enqueue({ event: asDomainEvent(row), subscriber });
			}
			await markDispatched(db, row.eventId);
		} catch (error) {
			if (row.attemptCount >= MAX_ATTEMPTS) {
				const reason = error instanceof Error ? error.message : 'unknown';
				for (const subscriber of subs) {
					await deadLetter(db, row, subscriber, reason);
				}
				await markDispatched(db, row.eventId);
			}
		}
	}
	return rows;
}
