import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { Ok, type Result, type UseCaseError } from '../../../shared/result';
import { listBlocksForUser, type BlockListItem } from '../infra/block-queries';

export async function listBlocks(
	db: Database,
	blockerId: UserId
): Promise<Result<BlockListItem[], UseCaseError>> {
	const items = await listBlocksForUser(db, blockerId);
	return Ok(items);
}
