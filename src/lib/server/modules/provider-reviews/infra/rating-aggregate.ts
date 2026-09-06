import { eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { newId, type ProviderProfileId } from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import { ratingAggregate, reviews } from './schema';

export async function recomputeRatingAggregate(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date
): Promise<{ average: string | null; count: number }> {
	const rows = await tx
		.select({
			average: sql<string | null>`round(avg(${reviews.rating})::numeric, 1)`,
			count: sql<number>`count(*)::int`
		})
		.from(reviews)
		.where(eq(reviews.providerProfileId, providerProfileId));

	const average = rows[0]?.average ?? null;
	const count = rows[0]?.count ?? 0;

	await tx
		.insert(ratingAggregate)
		.values({
			providerProfileId,
			average,
			count,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: ratingAggregate.providerProfileId,
			set: {
				average,
				count,
				updatedAt: now
			}
		});

	const event: DomainEvent<
		'RatingAggregateChanged',
		{ providerProfileId: string; average: string | null; count: number }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'RatingAggregateChanged',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			providerProfileId,
			average,
			count
		}
	};
	await publish(tx, event);

	return { average, count };
}
