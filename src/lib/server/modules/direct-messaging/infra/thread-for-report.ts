import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, ThreadId, UserId } from '../../../shared/ids';
import { getProfileOwnerIdDb } from '../../provider-profile';
import { threads } from './schema';

export async function getThreadForReport(
	db: Database,
	threadId: ThreadId
): Promise<{ threadId: ThreadId; participantIds: UserId[] } | null> {
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
	if (!row) return null;

	const providerOwnerId = await getProfileOwnerIdDb(db, row.providerProfileId as ProviderProfileId);
	if (!providerOwnerId) return null;

	return {
		threadId: row.id as ThreadId,
		participantIds: [row.seekerId as UserId, providerOwnerId]
	};
}

export async function isThreadParticipant(
	db: Database,
	threadId: string,
	userId: UserId
): Promise<boolean> {
	const thread = await getThreadForReport(db, threadId as ThreadId);
	if (!thread) return false;
	return thread.participantIds.includes(userId);
}
