import { and, eq, or } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { notifBlockCache } from './schema';

export async function isNotifBlockedBetween(
	db: Database | Transaction,
	userA: UserId,
	userB: UserId
): Promise<boolean> {
	const rows = await db
		.select({ blockerId: notifBlockCache.blockerId })
		.from(notifBlockCache)
		.where(
			or(
				and(eq(notifBlockCache.blockerId, userA), eq(notifBlockCache.blockedId, userB)),
				and(eq(notifBlockCache.blockerId, userB), eq(notifBlockCache.blockedId, userA))
			)
		)
		.limit(1);
	return rows.length > 0;
}

export async function mirrorNotifBlock(
	db: Database | Transaction,
	blockerId: UserId,
	blockedId: UserId,
	createdAt: Date
): Promise<void> {
	await db
		.insert(notifBlockCache)
		.values({ blockerId, blockedId, createdAt })
		.onConflictDoNothing();
}

export async function removeNotifBlock(
	db: Database | Transaction,
	blockerId: UserId,
	blockedId: UserId
): Promise<void> {
	await db
		.delete(notifBlockCache)
		.where(and(eq(notifBlockCache.blockerId, blockerId), eq(notifBlockCache.blockedId, blockedId)));
}
