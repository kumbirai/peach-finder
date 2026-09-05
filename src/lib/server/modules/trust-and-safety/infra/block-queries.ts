import { desc, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { getDisplayIdentity } from '../../identity-and-access';
import { blocks } from '../infra/schema';

export type BlockListItem = {
	blockedId: UserId;
	displayName: string;
	blockedAt: string;
};

export async function listBlocksForUser(db: Database, blockerId: UserId): Promise<BlockListItem[]> {
	const rows = await db
		.select({
			blockedId: blocks.blockedId,
			createdAt: blocks.createdAt
		})
		.from(blocks)
		.where(eq(blocks.blockerId, blockerId))
		.orderBy(desc(blocks.createdAt));

	const items: BlockListItem[] = [];
	for (const row of rows) {
		const identity = await getDisplayIdentity(db, row.blockedId as UserId);
		items.push({
			blockedId: row.blockedId as UserId,
			displayName: identity.isDeleted ? 'Deleted account' : identity.displayName,
			blockedAt: row.createdAt.toISOString()
		});
	}
	return items;
}
