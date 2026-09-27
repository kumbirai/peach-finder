import { sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { queryRows } from '../../../shared/sql-result';
import type { RawEventType } from './capture';

export async function countRawEvents(
	db: Database,
	providerProfileId: ProviderProfileId,
	eventType: RawEventType,
	viewerKey?: string
): Promise<number> {
	const rows = viewerKey
		? await db.execute(sql`
				SELECT COUNT(*)::int AS count
				FROM provider_analytics.raw_event
				WHERE provider_profile_id = ${providerProfileId}::uuid
				  AND event_type = ${eventType}
				  AND viewer_key = ${viewerKey}
			`)
		: await db.execute(sql`
				SELECT COUNT(*)::int AS count
				FROM provider_analytics.raw_event
				WHERE provider_profile_id = ${providerProfileId}::uuid
				  AND event_type = ${eventType}
			`);
	return Number(queryRows(rows)[0]?.count ?? 0);
}
