import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getSelfAccountSummary } from '../../identity-and-access';
import { insertBlock } from '../infra/block-commands';

export async function blockUser(
	db: Database,
	input: {
		blockerId: UserId;
		blockedId: UserId;
		now: Date;
		correlationId: string;
	}
): Promise<Result<{ blocked: true }, UseCaseError>> {
	if (input.blockerId === input.blockedId) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'blockedId', message: 'You cannot block yourself.' }]
		});
	}

	const blockedAccount = await getSelfAccountSummary(db, input.blockedId);
	if (!blockedAccount) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'blockedId', message: 'Invalid user id.' }]
		});
	}

	await insertBlock(db, input);
	return Ok({ blocked: true });
}
