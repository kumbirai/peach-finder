import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../db';
import type { UserId } from './ids';
import { mirrorBlock, removeBlockMirror } from '../modules/direct-messaging/infra/block-cache';
import { blockedPair } from '../modules/discovery-search/infra/schema';
import {
	mirrorNotifBlock,
	removeNotifBlock
} from '../modules/user-notifications/infra/block-cache';

export async function applyUserBlockedSync(
	db: Database | Transaction,
	blockerId: UserId,
	blockedId: UserId,
	occurredAt: Date
): Promise<void> {
	await mirrorBlock(db, blockerId, blockedId, occurredAt);
	await db.insert(blockedPair).values({ blockerId, blockedId }).onConflictDoNothing();
	await mirrorNotifBlock(db, blockerId, blockedId, occurredAt);
}

export async function applyUserUnblockedSync(
	db: Database | Transaction,
	blockerId: UserId,
	blockedId: UserId
): Promise<void> {
	await removeBlockMirror(db, blockerId, blockedId);
	await db
		.delete(blockedPair)
		.where(and(eq(blockedPair.blockerId, blockerId), eq(blockedPair.blockedId, blockedId)));
	await removeNotifBlock(db, blockerId, blockedId);
}
