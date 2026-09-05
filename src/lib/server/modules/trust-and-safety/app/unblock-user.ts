import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { removeBlock } from '../infra/block-commands';

export type UnblockUserResult = {
	blocked: false;
	removed: boolean;
	blockerId: UserId;
	blockedId: UserId;
};

export async function unblockUser(
	db: Database,
	input: {
		blockerId: UserId;
		blockedId: UserId;
		now: Date;
		correlationId: string;
	}
): Promise<Result<UnblockUserResult, UseCaseError>> {
	if (input.blockerId === input.blockedId) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'blockedId', message: 'Invalid user id.' }]
		});
	}

	const removed = await removeBlock(db, input);
	return Ok({
		blocked: false,
		removed,
		blockerId: input.blockerId,
		blockedId: input.blockedId
	});
}
