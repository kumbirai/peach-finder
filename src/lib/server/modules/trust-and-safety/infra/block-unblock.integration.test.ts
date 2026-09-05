import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import {
	seedCore,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_PROFILE_ID,
	SEED_DUAL_ROLE_USER_ID
} from '../../../../../../scripts/seed-core';
import { asId } from '../../../shared/ids';
import { createAuthContext } from '../../../shared/auth-context';
import {
	sendOrHoldMessage,
	sendMessageInThread,
	canSeekerMessageProvider
} from '../../direct-messaging';
import { runSearch } from '../../discovery-search';
import { blockedPair } from '../../discovery-search/infra/schema';
import { blockUser } from '../app/block-user';
import { unblockUser } from '../app/unblock-user';
import { listBlocks } from '../app/list-blocks';
import { blocks } from './schema';
import { notificationLog } from '../../user-notifications/infra/schema';
import { blockCache } from '../../direct-messaging/infra/schema';
import { notifBlockCache } from '../../user-notifications/infra/schema';
import { users } from '../../identity-and-access/infra/schema';
import type { Database } from '../../../db';

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

describe('US-SAFE-02 block instant silent messages both ways', () => {
	it('TC-SAFE-02a: instant bidirectional message block', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000c201');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Safe02 Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Before block',
				now,
				correlationId: 'corr-safe02a'
			});
			expect(sent.ok).toBe(true);
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const blocked = await blockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now: new Date(now.getTime() + 1000),
				correlationId: 'corr-safe02a-block'
			});
			expect(blocked.ok).toBe(true);
			if (!blocked.ok) throw new Error('block failed');

			expect(await canSeekerMessageProvider(db, seekerId, providerProfileId)).toBe(false);

			const providerSend = await sendMessageInThread(db, {
				threadId: sent.value.threadId,
				senderId: providerOwnerId,
				body: 'Provider reply after block',
				now: new Date(now.getTime() + 2000),
				correlationId: 'corr-safe02a-provider'
			});
			expect(providerSend.ok).toBe(false);
		});
	});

	it('TC-SAFE-02b: asymmetric discovery hide', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const blockerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const blockedId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const now = new Date('2026-09-05T12:00:00Z');

			const blocked = await blockUser(db, {
				blockerId,
				blockedId,
				now,
				correlationId: 'corr-safe02b'
			});
			expect(blocked.ok).toBe(true);

			const blockedViewer = createAuthContext({
				userId: blockedId,
				role: 'provider',
				sessionId: asId<'SessionId'>('01900000-0000-7000-8000-00000000c202'),
				ipAddress: '127.0.0.1'
			});
			const blockerViewer = createAuthContext({
				userId: blockerId,
				role: 'provider',
				sessionId: asId<'SessionId'>('01900000-0000-7000-8000-00000000c203'),
				ipAddress: '127.0.0.1'
			});

			const hiddenFromBlocked = await runSearch(db, { lexicon: [] }, blockedViewer);
			expect(
				hiddenFromBlocked.cards.some((card) => card.providerProfileId === SEED_DUAL_ROLE_PROFILE_ID)
			).toBe(false);

			const visibleToBlocker = await runSearch(db, { lexicon: [] }, blockerViewer);
			expect(
				visibleToBlocker.cards.some(
					(card) => card.providerProfileId === SEED_CORE_PRIMARY_PROFILE_ID
				)
			).toBe(true);

			const pairRows = await db.select().from(blockedPair);
			expect(pairRows).toHaveLength(1);
			expect(pairRows[0]?.blockerId).toBe(blockerId);
			expect(pairRows[0]?.blockedId).toBe(blockedId);
		});
	});

	it('TC-SAFE-02c: silent to the blocked party — no notification on block or activity', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000c204');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Safe02 Silent');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Pre-block message',
				now,
				correlationId: 'corr-safe02c'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const blocked = await blockUser(db, {
				blockerId: providerOwnerId,
				blockedId: seekerId,
				now: new Date(now.getTime() + 1000),
				correlationId: 'corr-safe02c-block'
			});
			expect(blocked.ok).toBe(true);

			const notifForBlocked = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.userId, seekerId));
			expect(notifForBlocked).toHaveLength(0);

			const afterBlock = await sendMessageInThread(db, {
				threadId: sent.value.threadId,
				senderId: seekerId,
				body: 'Should not notify provider',
				now: new Date(now.getTime() + 2000),
				correlationId: 'corr-safe02c-after'
			});
			expect(afterBlock.ok).toBe(false);

			const beforeNotifCount = (
				await db.select().from(notificationLog).where(eq(notificationLog.userId, providerOwnerId))
			).length;

			const retry = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Another attempt',
				now: new Date(now.getTime() + 3000),
				correlationId: 'corr-safe02c-retry'
			});
			expect(retry.ok).toBe(false);

			const afterNotifCount = (
				await db.select().from(notificationLog).where(eq(notificationLog.userId, providerOwnerId))
			).length;
			expect(afterNotifCount).toBe(beforeNotifCount);
		});
	});

	it('TC-SAFE-02d: view and undo own blocks', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000c205');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Safe02 Undo');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const blocked = await blockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now,
				correlationId: 'corr-safe02d-block'
			});
			expect(blocked.ok).toBe(true);

			const listed = await listBlocks(db, seekerId);
			expect(listed.ok).toBe(true);
			if (!listed.ok) throw new Error('list failed');
			expect(listed.value).toHaveLength(1);
			expect(listed.value[0]?.blockedId).toBe(providerOwnerId);

			const unblocked = await unblockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now: new Date(now.getTime() + 1000),
				correlationId: 'corr-safe02d-unblock'
			});
			expect(unblocked.ok).toBe(true);
			if (!unblocked.ok) throw new Error('unblock failed');

			const blockRows = await db.select().from(blocks).where(eq(blocks.blockerId, seekerId));
			expect(blockRows).toHaveLength(0);

			const emptyList = await listBlocks(db, seekerId);
			expect(emptyList.ok).toBe(true);
			if (!emptyList.ok) throw new Error('list failed');
			expect(emptyList.value).toHaveLength(0);

			expect(await canSeekerMessageProvider(db, seekerId, providerProfileId)).toBe(true);
		});
	});

	it('TC-SAFE-02e: block commands mirror all caches in the same transaction', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000c206');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Safe02 Sync');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const blocked = await blockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now,
				correlationId: 'corr-safe02e-block'
			});
			expect(blocked.ok).toBe(true);
			if (!blocked.ok) throw new Error('block failed');

			expect(await db.select().from(blockCache)).toHaveLength(1);
			expect(await db.select().from(blockedPair)).toHaveLength(1);
			expect(await db.select().from(notifBlockCache)).toHaveLength(1);
			expect(await canSeekerMessageProvider(db, seekerId, providerProfileId)).toBe(false);

			const unblocked = await unblockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now: new Date(now.getTime() + 1000),
				correlationId: 'corr-safe02e-unblock'
			});
			expect(unblocked.ok).toBe(true);
			if (!unblocked.ok) throw new Error('unblock failed');

			expect(await db.select().from(blockCache)).toHaveLength(0);
			expect(await db.select().from(blockedPair)).toHaveLength(0);
			expect(await db.select().from(notifBlockCache)).toHaveLength(0);
			expect(await canSeekerMessageProvider(db, seekerId, providerProfileId)).toBe(true);
		});
	});
});
