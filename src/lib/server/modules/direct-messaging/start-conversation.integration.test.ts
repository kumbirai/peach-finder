import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { SEED_MSG01_BLOCKED_SEEKER_ID, seedBlocking } from '../../../../../scripts/seed-blocking';
import { asId } from '../../shared/ids';
import { createAuthContext } from '../../shared/auth-context';
import { getPublicProfile } from '../provider-profile';
import {
	canSeekerMessageProvider,
	getThreadForSeekerProvider,
	sendOrHoldMessage,
	threadExistsForSeekerProvider
} from './index';
import { mirrorBlock } from './infra/block-cache';
import { threads } from './infra/schema';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db';
import { users } from '../identity-and-access/infra/schema';

async function seedSeeker(db: Database, id: string, displayName: string): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			displayName,
			email: `${id}@example.com`,
			emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
			status: 'active'
		})
		.onConflictDoNothing();
}

describe('US-MSG-01 start conversation integration', () => {
	it('TC-MSG-01a: one thread per seeker-provider pair reopens with history', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009901');
			await seedSeeker(db, seekerId, 'Msg01 Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const first = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Hello Amara',
				now,
				correlationId: 'corr-msg01a-1'
			});
			expect(first.ok).toBe(true);
			if (!first.ok || first.value.kind !== 'sent') throw new Error('first send failed');

			const second = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Following up',
				now: new Date(now.getTime() + 60_000),
				correlationId: 'corr-msg01a-2'
			});
			expect(second.ok).toBe(true);
			if (!second.ok || second.value.kind !== 'sent') throw new Error('second send failed');
			expect(second.value.threadId).toBe(first.value.threadId);

			const threadRows = await db.select().from(threads).where(eq(threads.seekerId, seekerId));
			expect(threadRows).toHaveLength(1);

			const thread = await getThreadForSeekerProvider(db, seekerId, providerProfileId);
			expect(thread?.messages).toHaveLength(2);
			expect(thread?.messages[0]?.body).toBe('Hello Amara');
			expect(thread?.messages[1]?.body).toBe('Following up');
		});
	});

	it('TC-MSG-01c: blocked seeker cannot message provider', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedBlocking(db);

			const seekerId = asId<'UserId'>(SEED_MSG01_BLOCKED_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

			expect(await canSeekerMessageProvider(db, seekerId, providerProfileId)).toBe(false);

			const profile = await getPublicProfile(
				db,
				providerProfileId,
				createAuthContext({
					userId: seekerId,
					role: 'seeker',
					sessionId: asId<'SessionId'>('01900000-0000-7000-8000-00000000b102'),
					ipAddress: '127.0.0.1'
				})
			);
			expect(profile.ok).toBe(true);

			const send = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Should not send',
				now: new Date(),
				correlationId: 'corr-msg01c'
			});
			expect(send.ok).toBe(false);
			if (send.ok || send.error.kind !== 'forbidden') throw new Error('expected blocked');
			expect(send.error.reason).toBe('blocked');

			expect(await getThreadForSeekerProvider(db, seekerId, providerProfileId)).toBeNull();
		});
	});

	it('threadExistsForSeekerProvider reflects persisted thread', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009902');
			await seedSeeker(db, seekerId, 'Exists Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

			expect(await threadExistsForSeekerProvider(db, seekerId, providerProfileId)).toBe(false);

			await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'First contact',
				now: new Date(),
				correlationId: 'corr-exists'
			});

			expect(await threadExistsForSeekerProvider(db, seekerId, providerProfileId)).toBe(true);
		});
	});

	it('block mirror enforces symmetric messaging denial', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerA = asId<'UserId'>('01900000-0000-7000-8000-000000009903');
			const seekerB = asId<'UserId'>('01900000-0000-7000-8000-000000009904');
			await seedSeeker(db, seekerA, 'Blocked Seeker A');
			await seedSeeker(db, seekerB, 'Open Seeker B');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const ownerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const now = new Date();

			await mirrorBlock(db, seekerA, ownerId, now);

			expect(await canSeekerMessageProvider(db, seekerA, providerProfileId)).toBe(false);
			expect(await canSeekerMessageProvider(db, seekerB, providerProfileId)).toBe(true);
		});
	});
});
