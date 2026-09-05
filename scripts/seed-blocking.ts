import type { Database } from '../src/lib/server/db';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from './seed-core';
import { seedPlatform, loadConfigCache } from '../src/lib/server/modules/platform-configuration';
import { hashPassword } from '../src/lib/server/modules/identity-and-access/infra/password-hash';
import { users } from '../src/lib/server/modules/identity-and-access/infra/schema';
import { providerProfiles } from '../src/lib/server/modules/provider-profile/infra/schema';
import { blocks } from '../src/lib/server/modules/trust-and-safety/infra/schema';
import { blockCache } from '../src/lib/server/modules/direct-messaging/infra/schema';
import { eq } from 'drizzle-orm';

export const SEED_MSG01_BLOCKED_SEEKER_ID = '01900000-0000-7000-8000-00000000b101';
export const SEED_MSG01_BLOCKED_SEEKER_EMAIL = 'msg01-blocked@example.com';
export const SEED_MSG01_BLOCKED_SEEKER_PASSWORD = 'password123';

/** Provider owner blocked this seeker — used by TC-MSG-01c / seed-blocking pack. */
export async function seedBlocking(db: Database): Promise<void> {
	await seedCore(db);

	const providerOwner = await db
		.select({ ownerId: providerProfiles.ownerId })
		.from(providerProfiles)
		.where(eq(providerProfiles.id, SEED_CORE_PRIMARY_PROFILE_ID))
		.limit(1);
	const ownerId = providerOwner[0]?.ownerId;
	if (!ownerId) throw new Error('seed-blocking: primary provider missing');

	const blockedAt = new Date('2026-09-01T09:00:00Z');
	const passwordHash = await hashPassword(SEED_MSG01_BLOCKED_SEEKER_PASSWORD);

	await db
		.insert(users)
		.values({
			id: SEED_MSG01_BLOCKED_SEEKER_ID,
			displayName: 'Blocked Seeker',
			email: SEED_MSG01_BLOCKED_SEEKER_EMAIL,
			emailVerifiedAt: blockedAt,
			passwordHash,
			status: 'active'
		})
		.onConflictDoNothing();

	await db
		.insert(blocks)
		.values({
			blockerId: ownerId,
			blockedId: SEED_MSG01_BLOCKED_SEEKER_ID,
			createdAt: blockedAt
		})
		.onConflictDoNothing();

	await db
		.insert(blockCache)
		.values({
			blockerId: ownerId,
			blockedId: SEED_MSG01_BLOCKED_SEEKER_ID,
			createdAt: blockedAt
		})
		.onConflictDoNothing();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { getDb, closeDb } = await import('../src/lib/server/db');
	const db = getDb();
	await seedPlatform(db);
	await loadConfigCache(db);
	await seedBlocking(db);
	await closeDb();
	console.info('seed-blocking complete');
}
