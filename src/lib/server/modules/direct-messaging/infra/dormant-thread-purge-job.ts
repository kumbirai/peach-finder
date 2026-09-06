import { sql, inArray } from 'drizzle-orm';
import type { Database } from '../../../db';
import { log } from '../../../shared/logger';
import { pingHealthcheck } from '../../../shared/healthcheck';
import { queryRows } from '../../../shared/sql-result';
import type { ThreadId } from '../../../shared/ids';
import { DORMANT_THREAD_MONTHS } from '../domain/dormant-thread-retention';
import { messages, threads } from './schema';

export type DormantThreadPurgeJobResult = {
	threadsPurged: number;
	messagesPurged: number;
};

export async function purgeDormantThreads(
	db: Database,
	now: Date
): Promise<DormantThreadPurgeJobResult> {
	const startedAt = Date.now();
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - DORMANT_THREAD_MONTHS);

	const dormant = await db.execute(sql`
		SELECT t.id
		FROM direct_messaging.thread t
		INNER JOIN identity_and_access."user" seeker ON seeker.id = t.seeker_id
		INNER JOIN provider_profile.provider_profile profile ON profile.id = t.provider_profile_id
		INNER JOIN identity_and_access."user" provider_owner ON provider_owner.id = profile.owner_id
		WHERE t.last_activity_at <= ${cutoff.toISOString()}::timestamptz
		  AND seeker.status <> 'deleted'
		  AND provider_owner.status <> 'deleted'
	`);

	const threadIds = queryRows(dormant).map((row) => String(row.id) as ThreadId);
	if (threadIds.length === 0) {
		const empty = { threadsPurged: 0, messagesPurged: 0 };
		log('info', 'dormant-thread purge completed', {
			threadsPurged: 0,
			messagesPurged: 0,
			durationMs: Date.now() - startedAt
		});
		await pingHealthcheck('HEALTHCHECK_DORMANT_THREAD_PURGE');
		return empty;
	}

	const messageDelete = await db
		.delete(messages)
		.where(inArray(messages.threadId, threadIds))
		.returning({ id: messages.id });
	const messagesPurged = messageDelete.length;

	const threadDelete = await db
		.delete(threads)
		.where(inArray(threads.id, threadIds))
		.returning({ id: threads.id });
	const threadsPurged = threadDelete.length;

	const result = { threadsPurged, messagesPurged };
	log('info', 'dormant-thread purge completed', {
		threadsPurged: result.threadsPurged,
		messagesPurged: result.messagesPurged,
		durationMs: Date.now() - startedAt
	});
	await pingHealthcheck('HEALTHCHECK_DORMANT_THREAD_PURGE');
	return result;
}
