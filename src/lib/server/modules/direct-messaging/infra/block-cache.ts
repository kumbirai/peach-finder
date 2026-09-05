import { and, eq, or } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { blockCache } from './schema';

export async function isBlockedBetween(
	db: Database | Transaction,
	userA: UserId,
	userB: UserId
): Promise<boolean> {
	const rows = await db
		.select({ blockerId: blockCache.blockerId })
		.from(blockCache)
		.where(
			or(
				and(eq(blockCache.blockerId, userA), eq(blockCache.blockedId, userB)),
				and(eq(blockCache.blockerId, userB), eq(blockCache.blockedId, userA))
			)
		)
		.limit(1);
	return rows.length > 0;
}

export async function mirrorBlock(
	db: Database | Transaction,
	blockerId: UserId,
	blockedId: UserId,
	createdAt: Date
): Promise<void> {
	await db.insert(blockCache).values({ blockerId, blockedId, createdAt }).onConflictDoNothing();
}

export async function removeBlockMirror(
	db: Database | Transaction,
	blockerId: UserId,
	blockedId: UserId
): Promise<void> {
	await db
		.delete(blockCache)
		.where(and(eq(blockCache.blockerId, blockerId), eq(blockCache.blockedId, blockedId)));
}
