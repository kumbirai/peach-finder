import type { Database } from '../src/lib/server/db';
import { sql } from 'drizzle-orm';
import { seedCore } from './seed-core';

/** Fixed availability lifecycle fixtures for US-AVAIL-03 E2E and integration. */
export const SEED_AVAIL_WARN_PROFILE_ID = '01900000-0000-7000-8000-000000000101';
export const SEED_AVAIL_EXPIRED_PROFILE_ID = '01900000-0000-7000-8000-000000000102';

export async function seedAvailability(db: Database): Promise<void> {
	await seedCore(db);

	const warnSetAt = new Date('2026-09-05T08:00:00Z');
	const warnExpiresAt = new Date('2026-09-05T12:00:00Z');
	const warnTickAt = new Date('2026-09-05T11:45:00Z');

	const expiredSetAt = new Date('2026-09-05T04:00:00Z');
	const expiredExpiresAt = new Date('2026-09-05T08:00:00Z');

	await db.execute(sql`
		update provider_availability.availability_status
		set state = 'available',
		    set_at = ${warnSetAt.toISOString()}::timestamptz,
		    expires_at = ${warnExpiresAt.toISOString()}::timestamptz,
		    warned_at = null,
		    updated_at = ${warnSetAt.toISOString()}::timestamptz
		where provider_profile_id = ${SEED_AVAIL_WARN_PROFILE_ID}::uuid
	`);

	await db.execute(sql`
		update provider_availability.availability_status
		set state = 'available',
		    set_at = ${expiredSetAt.toISOString()}::timestamptz,
		    expires_at = ${expiredExpiresAt.toISOString()}::timestamptz,
		    warned_at = null,
		    updated_at = ${expiredSetAt.toISOString()}::timestamptz
		where provider_profile_id = ${SEED_AVAIL_EXPIRED_PROFILE_ID}::uuid
	`);

	await db.execute(sql`
		update discovery_search.search_projection
		set availability_state = 'available',
		    availability_set_at = ${warnSetAt.toISOString()}::timestamptz,
		    updated_at = ${warnSetAt.toISOString()}::timestamptz
		where provider_profile_id = ${SEED_AVAIL_WARN_PROFILE_ID}::uuid
	`);

	await db.execute(sql`
		update discovery_search.search_projection
		set availability_state = 'available',
		    availability_set_at = ${expiredSetAt.toISOString()}::timestamptz,
		    updated_at = ${expiredSetAt.toISOString()}::timestamptz
		where provider_profile_id = ${SEED_AVAIL_EXPIRED_PROFILE_ID}::uuid
	`);

	void warnTickAt;
}
