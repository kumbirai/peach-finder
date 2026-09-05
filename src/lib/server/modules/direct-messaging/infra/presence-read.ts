import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { getConfig } from '../../platform-configuration';
import { bucketPresence, type PresenceBucket } from '../domain/presence-buckets';
import {
	bucketResponseTime,
	median,
	type ResponseTimeBucket
} from '../domain/response-time-bucket';
import { messages } from './schema';

export async function getPresence(
	db: Database,
	userId: UserId,
	now: Date = new Date()
): Promise<PresenceBucket> {
	const rows = await db
		.select({ sentAt: messages.sentAt })
		.from(messages)
		.where(eq(messages.senderId, userId))
		.orderBy(desc(messages.sentAt))
		.limit(1);

	const lastSeen = rows[0]?.sentAt ?? null;
	const timeZone = getConfig('platform-configuration.operating_timezone');
	return bucketPresence(lastSeen, now, timeZone);
}

export async function getResponseTime(
	db: Database,
	providerProfileId: ProviderProfileId,
	now: Date = new Date()
): Promise<ResponseTimeBucket | null> {
	const windowDays = getConfig('direct-messaging.response_time_window_days');
	const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

	const sampleRows = await db.execute<{ latencyMs: number }>(sql`
		SELECT EXTRACT(EPOCH FROM (first_reply.sent_at - t.created_at)) * 1000 AS "latencyMs"
		FROM direct_messaging.thread t
		INNER JOIN LATERAL (
			SELECT m.sent_at
			FROM direct_messaging.message m
			WHERE m.thread_id = t.id
			  AND m.sender_id != t.seeker_id
			ORDER BY m.sent_at ASC
			LIMIT 1
		) first_reply ON true
		WHERE t.provider_profile_id = ${providerProfileId}
		  AND t.created_at >= ${windowStart.toISOString()}::timestamptz
	`);

	const latencies = (sampleRows as unknown as { latencyMs: number }[])
		.map((row) => Number(row.latencyMs))
		.filter((value) => Number.isFinite(value) && value >= 0);

	if (latencies.length < 3) return null;

	const medianMs = median(latencies);
	if (medianMs === null) return null;
	return bucketResponseTime(medianMs);
}

export async function hasSentSince(db: Database, userId: UserId, since: Date): Promise<boolean> {
	const rows = await db
		.select({ id: messages.id })
		.from(messages)
		.where(and(eq(messages.senderId, userId), gte(messages.sentAt, since)))
		.limit(1);
	return rows.length > 0;
}
