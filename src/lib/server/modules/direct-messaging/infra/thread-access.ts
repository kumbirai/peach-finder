import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, ThreadId, UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getProfileOwnerIdDb } from '../../provider-profile';
import { isBlockedBetween } from './block-cache';
import { threads } from './schema';

const threadNotFound = (): UseCaseError => ({ kind: 'not_found', resource: 'thread' });

export type ThreadAccess = {
	threadId: ThreadId;
	seekerId: UserId;
	providerProfileId: ProviderProfileId;
	providerOwnerId: UserId;
	viewerRole: 'seeker' | 'provider';
	counterpartUserId: UserId;
};

export async function resolveThreadAccess(
	db: Database,
	threadId: ThreadId,
	callerId: UserId
): Promise<Result<ThreadAccess, UseCaseError>> {
	const rows = await db
		.select({
			id: threads.id,
			seekerId: threads.seekerId,
			providerProfileId: threads.providerProfileId
		})
		.from(threads)
		.where(eq(threads.id, threadId))
		.limit(1);

	const row = rows[0];
	if (!row) return Err(threadNotFound());

	const providerOwnerId = await getProfileOwnerIdDb(db, row.providerProfileId as ProviderProfileId);
	if (!providerOwnerId) return Err(threadNotFound());

	const seekerId = row.seekerId as UserId;
	const isSeeker = seekerId === callerId;
	const isProvider = providerOwnerId === callerId;
	if (!isSeeker && !isProvider) return Err(threadNotFound());

	if (await isBlockedBetween(db, seekerId, providerOwnerId)) {
		return Err(threadNotFound());
	}

	return Ok({
		threadId: row.id as ThreadId,
		seekerId,
		providerProfileId: row.providerProfileId as ProviderProfileId,
		providerOwnerId,
		viewerRole: isSeeker ? 'seeker' : 'provider',
		counterpartUserId: isSeeker ? providerOwnerId : seekerId
	});
}

export async function resolveThreadAccessByProviderProfile(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId
): Promise<Result<ThreadAccess, UseCaseError>> {
	const pair = await db
		.select({ id: threads.id })
		.from(threads)
		.where(and(eq(threads.seekerId, seekerId), eq(threads.providerProfileId, providerProfileId)))
		.limit(1);

	if (!pair[0]) return Err(threadNotFound());
	return resolveThreadAccess(db, pair[0].id as ThreadId, seekerId);
}
