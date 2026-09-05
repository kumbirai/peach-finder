import type { Database } from '../../../db';
import { newId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { sql } from 'drizzle-orm';

const MAX_PROPOSAL_NAME = 60;

export async function proposeServiceTag(
	db: Database,
	userId: UserId,
	name: string
): Promise<Result<{ proposalId: string }, UseCaseError>> {
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > MAX_PROPOSAL_NAME) {
		return Err({
			kind: 'validation_failed',
			issues: [
				{
					path: 'name',
					message: `Tag name must be between 1 and ${MAX_PROPOSAL_NAME} characters.`
				}
			]
		});
	}

	const proposalId = newId();
	await db.execute(sql`
		insert into provider_profile.service_tag_proposal (id, proposed_by, name, status)
		values (${proposalId}::uuid, ${userId}::uuid, ${trimmed}, 'pending')
	`);

	return Ok({ proposalId });
}
