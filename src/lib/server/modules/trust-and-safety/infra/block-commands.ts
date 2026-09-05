import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { publish } from '../../../shared/outbox';
import { newId, type UserId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { blocks } from './schema';

export async function insertBlock(
	db: Database | Transaction,
	input: {
		blockerId: UserId;
		blockedId: UserId;
		now: Date;
		correlationId: string;
	}
): Promise<void> {
	if (input.blockerId === input.blockedId) return;

	await db.transaction(async (tx) => {
		const inserted = await tx
			.insert(blocks)
			.values({
				blockerId: input.blockerId,
				blockedId: input.blockedId,
				createdAt: input.now
			})
			.onConflictDoNothing()
			.returning({ blockerId: blocks.blockerId });

		if (inserted.length === 0) return;

		const event: DomainEvent<'UserBlocked', { blockerId: string; blockedId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'UserBlocked',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: { blockerId: input.blockerId, blockedId: input.blockedId }
		};
		await publish(tx, event);
	});
}

export async function removeBlock(
	db: Database | Transaction,
	input: {
		blockerId: UserId;
		blockedId: UserId;
		now: Date;
		correlationId: string;
	}
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.delete(blocks)
			.where(and(eq(blocks.blockerId, input.blockerId), eq(blocks.blockedId, input.blockedId)));

		const event: DomainEvent<'UserUnblocked', { blockerId: string; blockedId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'UserUnblocked',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: { blockerId: input.blockerId, blockedId: input.blockedId }
		};
		await publish(tx, event);
	});
}
