import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_USER_ID,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../../../../scripts/seed-core';
import {
	deleteAccount,
	registerSeeker,
	loginPassword,
	getDisplayIdentity,
	anonymizePendingUsers,
	findActiveSession
} from './index';
import { createSession } from './infra/session-commands';
import { users } from './infra/schema';
import { providerProfiles } from '../provider-profile/infra/schema';
import { searchProjection } from '../discovery-search/infra/schema';
import { messages, threads } from '../direct-messaging/infra/schema';
import { reviews } from '../provider-reviews/infra/schema';
import { getPublicProfile } from '../provider-profile';
import { listProviderInbox } from '../direct-messaging';
import { anonymousAuth } from '../../shared/auth-context';
import { asId } from '../../shared/ids';

describe('US-ACC-05 delete my account integration', () => {
	it('TC-ACC-05a/b: self-delete revokes sessions and unpublishes provider profile', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date();
			const login = await loginPassword(db, {
				email: SEED_DUAL_ROLE_EMAIL,
				password: SEED_DUAL_ROLE_PASSWORD
			});
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const userId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const { token, sessionId } = await createSession(db, {
				userId,
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});

			const deleted = await deleteAccount(
				db,
				{ userId, sessionId, password: SEED_DUAL_ROLE_PASSWORD, confirm: true },
				now,
				'test-delete'
			);
			expect(deleted.ok).toBe(true);

			const session = await findActiveSession(db, token, now);
			expect(session).toBeNull();

			const profileRow = await db
				.select({ publishState: providerProfiles.publishState })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(profileRow[0]?.publishState).toBe('unpublished');

			const projection = await db
				.select()
				.from(searchProjection)
				.where(eq(searchProjection.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));
			expect(projection).toHaveLength(0);
		});
	});

	it('TC-ACC-05c: threads and reviews survive with anonymized labels', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date();
			const email = `delete-seeker-${Date.now()}@example.com`;
			await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Delete Seeker',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);

			const login = await loginPassword(db, { email, password: 'password123' });
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const userId = login.value.userId;

			const threadId = '01900000-0000-7000-8000-000000009902';
			await db.insert(threads).values({
				id: threadId,
				seekerId: userId,
				providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
				createdAt: now,
				lastActivityAt: now
			});
			await db.insert(messages).values({
				id: '01900000-0000-7000-8000-000000009903',
				threadId,
				senderId: userId,
				body: 'Hello from soon-deleted seeker',
				sentAt: now
			});

			const reviewId = '01900000-0000-7000-8000-000000009904';
			await db.insert(reviews).values({
				id: reviewId,
				providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
				reviewerId: userId,
				rating: 5,
				body: 'Great massage',
				createdAt: now
			});

			const ownerId = (
				await db
					.select({ ownerId: providerProfiles.ownerId })
					.from(providerProfiles)
					.where(eq(providerProfiles.id, SEED_CORE_PRIMARY_PROFILE_ID))
					.limit(1)
			)[0]?.ownerId;
			expect(ownerId).toBeTruthy();

			const { sessionId } = await createSession(db, {
				userId,
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});

			const deleted = await deleteAccount(
				db,
				{ userId, sessionId, password: 'password123', confirm: true },
				now,
				'test-delete'
			);
			expect(deleted.ok).toBe(true);

			const inbox = await listProviderInbox(db, asId<'UserId'>(ownerId!));
			const thread = inbox.find((t) => t.lastMessagePreview.includes('soon-deleted'));
			expect(thread?.counterpartName).toBe('Deleted account');

			const profile = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(profile.ok).toBe(true);
			if (!profile.ok) return;
			const review = profile.value.reviews.find((r) => r.id === reviewId);
			expect(review?.reviewerName).toBe('Former user');
		});
	});

	it('TC-ACC-05d: anonymization scrubs PII after the retention window', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `anonymize-${Date.now()}@example.com`;
			await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Anonymize Me',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);

			const login = await loginPassword(db, { email, password: 'password123' });
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const userId = login.value.userId;
			const { sessionId } = await createSession(db, {
				userId,
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});

			await deleteAccount(
				db,
				{ userId, sessionId, password: 'password123', confirm: true },
				now,
				'test-delete'
			);

			const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60_000);
			await db.update(users).set({ deletedAt: thirtyOneDaysAgo }).where(eq(users.id, userId));

			const count = await anonymizePendingUsers(db, now);
			expect(count).toBeGreaterThanOrEqual(1);

			const row = await db
				.select({
					email: users.email,
					phone: users.phone,
					passwordHash: users.passwordHash,
					displayName: users.displayName,
					anonymizedAt: users.anonymizedAt
				})
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			expect(row[0]?.email).toBeNull();
			expect(row[0]?.phone).toBeNull();
			expect(row[0]?.passwordHash).toBeNull();
			expect(row[0]?.displayName).toBe('Deleted user');
			expect(row[0]?.anonymizedAt).not.toBeNull();

			const identity = await getDisplayIdentity(db, userId);
			expect(identity.isDeleted).toBe(true);
		});
	});

	it('rejects a second delete for an already-deleted account', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `double-delete-${Date.now()}@example.com`;
			await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Double Delete',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);

			const login = await loginPassword(db, { email, password: 'password123' });
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const userId = login.value.userId;
			const { sessionId } = await createSession(db, {
				userId,
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});
			const input = {
				userId,
				sessionId,
				password: 'password123',
				confirm: true as const
			};

			const first = await deleteAccount(db, input, now, 'delete-1');
			expect(first.ok).toBe(true);

			const second = await deleteAccount(db, input, now, 'delete-2');
			expect(second.ok).toBe(false);
			if (second.ok) return;
			expect(second.error).toEqual({ kind: 'forbidden', reason: 'account already deleted' });
		});
	});

	it('allows only one concurrent delete to succeed', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date();
			const userId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const sessionA = await createSession(db, {
				userId,
				ipAddress: '127.0.0.1',
				userAgent: 'test-a',
				now
			});
			const sessionB = await createSession(db, {
				userId,
				ipAddress: '127.0.0.1',
				userAgent: 'test-b',
				now
			});
			const input = (sessionId: typeof sessionA.sessionId) => ({
				userId,
				sessionId,
				password: SEED_DUAL_ROLE_PASSWORD,
				confirm: true as const
			});

			const results = await Promise.all([
				deleteAccount(db, input(sessionA.sessionId), now, 'race-1'),
				deleteAccount(db, input(sessionB.sessionId), now, 'race-2')
			]);

			const successes = results.filter((r) => r.ok);
			const failures = results.filter((r) => !r.ok);
			expect(successes).toHaveLength(1);
			expect(failures).toHaveLength(1);
			const failed = failures[0];
			expect(failed).toBeDefined();
			if (!failed) return;
			expect(failed.error).toEqual({
				kind: 'forbidden',
				reason: 'account already deleted'
			});
		});
	});
});
