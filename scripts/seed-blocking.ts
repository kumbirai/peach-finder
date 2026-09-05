import type { Database } from '../src/lib/server/db';
import { eq } from 'drizzle-orm';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from './seed-core';
import { seedPlatform, loadConfigCache } from '../src/lib/server/modules/platform-configuration';
import { hashPassword } from '../src/lib/server/modules/identity-and-access/infra/password-hash';
import { users } from '../src/lib/server/modules/identity-and-access/infra/schema';
import { providerProfiles } from '../src/lib/server/modules/provider-profile/infra/schema';
import { blocks } from '../src/lib/server/modules/trust-and-safety/infra/schema';
import { blockCache } from '../src/lib/server/modules/direct-messaging/infra/schema';
import { blockedPair } from '../src/lib/server/modules/discovery-search/infra/schema';
import { notifBlockCache } from '../src/lib/server/modules/user-notifications/infra/schema';
import { threads, messages } from '../src/lib/server/modules/direct-messaging/infra/schema';
import { reviews } from '../src/lib/server/modules/provider-reviews/infra/schema';

export const SEED_MSG01_BLOCKED_SEEKER_ID = '01900000-0000-7000-8000-00000000b101';
export const SEED_MSG01_BLOCKED_SEEKER_EMAIL = 'msg01-blocked@example.com';
export const SEED_MSG01_BLOCKED_SEEKER_PASSWORD = 'password123';

/** Seeker used by e2e-block-unblock — not pre-blocked; has thread + review history with Amara. */
export const SEED_SAFE02_SEEKER_ID = '01900000-0000-7000-8000-00000000c301';
export const SEED_SAFE02_SEEKER_EMAIL = 'safe02-seeker@example.com';
export const SEED_SAFE02_SEEKER_PASSWORD = 'password123';

export const SEED_SAFE02_AMARA_EMAIL = 'amara@example.com';
export const SEED_SAFE02_AMARA_PASSWORD = 'password123';

const AMARA_OWNER_ID = '01900000-0000-7000-8000-000000000001';
const SAFE02_THREAD_ID = '01900000-0000-7000-8000-00000000c311';
const SAFE02_MESSAGE_ID = '01900000-0000-7000-8000-00000000c312';
const SAFE02_REVIEW_ID = '01900000-0000-7000-8000-00000000c313';

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
	const safe02PasswordHash = await hashPassword(SEED_SAFE02_SEEKER_PASSWORD);
	const amaraPasswordHash = await hashPassword(SEED_SAFE02_AMARA_PASSWORD);

	await db
		.update(users)
		.set({
			email: SEED_SAFE02_AMARA_EMAIL,
			emailVerifiedAt: blockedAt,
			passwordHash: amaraPasswordHash
		})
		.where(eq(users.id, AMARA_OWNER_ID));

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
		.insert(users)
		.values({
			id: SEED_SAFE02_SEEKER_ID,
			displayName: 'Safe02 Seeker',
			email: SEED_SAFE02_SEEKER_EMAIL,
			emailVerifiedAt: blockedAt,
			passwordHash: safe02PasswordHash,
			status: 'active'
		})
		.onConflictDoNothing();

	await db
		.insert(threads)
		.values({
			id: SAFE02_THREAD_ID,
			seekerId: SEED_SAFE02_SEEKER_ID,
			providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
			createdAt: new Date('2026-08-28T10:00:00Z'),
			lastActivityAt: new Date('2026-08-28T10:05:00Z')
		})
		.onConflictDoNothing();

	await db
		.insert(messages)
		.values({
			id: SAFE02_MESSAGE_ID,
			threadId: SAFE02_THREAD_ID,
			senderId: SEED_SAFE02_SEEKER_ID,
			body: 'History before any block in this story.',
			sentAt: new Date('2026-08-28T10:00:00Z'),
			deliveredAt: new Date('2026-08-28T10:00:30Z'),
			readAt: new Date('2026-08-28T10:01:00Z')
		})
		.onConflictDoNothing();

	await db
		.insert(reviews)
		.values({
			id: SAFE02_REVIEW_ID,
			providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
			reviewerId: SEED_SAFE02_SEEKER_ID,
			rating: 5,
			body: 'Prior review that must remain after blocking.',
			createdAt: new Date('2026-08-27T12:00:00Z')
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

	await db
		.insert(blockedPair)
		.values({
			blockerId: ownerId,
			blockedId: SEED_MSG01_BLOCKED_SEEKER_ID
		})
		.onConflictDoNothing();

	await db
		.insert(notifBlockCache)
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
