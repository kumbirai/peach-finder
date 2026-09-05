import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { publish } from '../../../shared/outbox';
import { applyUserBlockedSync, applyUserUnblockedSync } from '../../../shared/block-sync';
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
): Promise<boolean> {
	if (input.blockerId === input.blockedId) return false;

	let created = false;
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
		created = true;

		const event: DomainEvent<'UserBlocked', { blockerId: string; blockedId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'UserBlocked',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: { blockerId: input.blockerId, blockedId: input.blockedId }
		};
		await publish(tx, event);
		await applyUserBlockedSync(tx, input.blockerId, input.blockedId, input.now);
	});
	return created;
}

export async function removeBlock(
	db: Database | Transaction,
	input: {
		blockerId: UserId;
		blockedId: UserId;
		now: Date;
		correlationId: string;
	}
): Promise<boolean> {
	let removed = false;
	await db.transaction(async (tx) => {
		const deleted = await tx
			.delete(blocks)
			.where(and(eq(blocks.blockerId, input.blockerId), eq(blocks.blockedId, input.blockedId)))
			.returning({ blockerId: blocks.blockerId });

		if (deleted.length === 0) return;
		removed = true;

		const event: DomainEvent<'UserUnblocked', { blockerId: string; blockedId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'UserUnblocked',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: { blockerId: input.blockerId, blockedId: input.blockedId }
		};
		await publish(tx, event);
		await applyUserUnblockedSync(tx, input.blockerId, input.blockedId);
	});
	return removed;
}
