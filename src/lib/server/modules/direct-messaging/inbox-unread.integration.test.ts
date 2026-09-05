import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import {
	listSeekerThreads,
	listProviderInbox,
	sendMessageInThread,
	sendOrHoldMessage
} from './index';
import { users } from '../identity-and-access/infra/schema';

async function seedSeeker(
	db: import('../../db').Database,
	id: string,
	name: string
): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			displayName: name,
			email: `${id}@example.com`,
			emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
			status: 'active'
		})
		.onConflictDoNothing();
}

describe('US-MSG-04 inbox unread integration', () => {
	it('TC-MSG-04a: thread lists order by latest activity and expose unread counts', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a401');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Inbox Seeker');

			const profileA = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const profileB = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);

			const older = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: profileA,
				body: 'Older thread opener',
				now: new Date('2026-09-05T10:00:00Z'),
				correlationId: 'corr-msg04-older'
			});
			const newer = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: profileB,
				body: 'Newer thread opener',
				now: new Date('2026-09-05T12:00:00Z'),
				correlationId: 'corr-msg04-newer'
			});
			if (!older.ok || older.value.kind !== 'sent') throw new Error('older send failed');
			if (!newer.ok || newer.value.kind !== 'sent') throw new Error('newer send failed');
			const olderThread = older.value;
			const newerThread = newer.value;

			await sendMessageInThread(db, {
				threadId: olderThread.threadId,
				senderId: providerOwnerId,
				body: 'Unread reply on older thread',
				now: new Date('2026-09-05T10:30:00Z'),
				correlationId: 'corr-msg04-reply'
			});

			const seekerThreads = await listSeekerThreads(db, seekerId);
			expect(seekerThreads[0]?.threadId).toBe(newerThread.threadId);
			expect(seekerThreads[1]?.threadId).toBe(olderThread.threadId);
			expect(seekerThreads.find((t) => t.threadId === olderThread.threadId)?.unreadCount).toBe(1);
			expect(seekerThreads.find((t) => t.threadId === newerThread.threadId)?.unreadCount).toBe(0);

			const providerInbox = await listProviderInbox(db, providerOwnerId);
			const providerThread = providerInbox.find((t) => t.threadId === olderThread.threadId);
			expect(providerThread?.unreadCount).toBe(1);
		});
	});
});
