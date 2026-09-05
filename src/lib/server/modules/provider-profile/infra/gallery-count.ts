import { sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';

export async function getGalleryReadyCount(db: Database, ownerId: UserId): Promise<number> {
	const rows = await db.execute<{ count: number }>(sql`
		select count(*)::int as count
		from provider_profile.provider_photo pp
		inner join provider_profile.provider_profile p on p.id = pp.provider_profile_id
		where p.owner_id = ${ownerId}::uuid
		  and pp.status = 'ready'
	`);
	return (rows as unknown as { count: number }[])[0]?.count ?? 0;
}

export async function getGalleryTotalCount(db: Database, ownerId: UserId): Promise<number> {
	const rows = await db.execute<{ count: number }>(sql`
		select count(*)::int as count
		from provider_profile.provider_photo pp
		inner join provider_profile.provider_profile p on p.id = pp.provider_profile_id
		where p.owner_id = ${ownerId}::uuid
	`);
	return (rows as unknown as { count: number }[])[0]?.count ?? 0;
}
