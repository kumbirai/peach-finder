import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../../db';
import { asDomainEvent, type UndispatchedOutboxRow } from '../../../shared/outbox';
import { outbox, processedEvents } from '../../../shared/schema';
import { handleModerationActionTaken } from './moderation-subscriptions';

const PROFILE_MODERATION_SUBSCRIBER = 'provider-profile.moderation-effect';

export async function dispatchPendingProviderProfileModerationEffects(
	db: Database,
	limit = 50
): Promise<number> {
	const rows = await db
		.select({
			eventId: outbox.eventId,
			eventName: outbox.eventName,
			version: outbox.version,
			occurredAt: outbox.occurredAt,
			correlationId: outbox.correlationId,
			payload: outbox.payload,
			publishedAt: outbox.publishedAt,
			attemptCount: outbox.attemptCount
		})
		.from(outbox)
		.leftJoin(
			processedEvents,
			and(
				eq(processedEvents.eventId, outbox.eventId),
				eq(processedEvents.subscriber, PROFILE_MODERATION_SUBSCRIBER)
			)
		)
		.where(and(eq(outbox.eventName, 'ModerationActionTaken'), isNull(processedEvents.eventId)))
		.orderBy(asc(outbox.publishedAt))
		.limit(limit);

	let handled = 0;
	for (const row of rows) {
		await handleModerationActionTaken(db, asDomainEvent(row as UndispatchedOutboxRow) as never);
		handled += 1;
	}
	return handled;
}
