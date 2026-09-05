import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import { getResponseTime, sendMessageInThread, sendOrHoldMessage } from './index';
import { users } from '../identity-and-access/infra/schema';
import type { Database } from '../../db';

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

describe('US-MSG-05 response-time first-reply integration', () => {
	it('TC-MSG-05b: only the first provider reply per thread counts toward the metric', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const baseTime = new Date('2026-09-05T10:00:00Z');

			const seekerIds = [
				asId<'UserId'>('01900000-0000-7000-8000-00000000a501'),
				asId<'UserId'>('01900000-0000-7000-8000-00000000a502'),
				asId<'UserId'>('01900000-0000-7000-8000-00000000a503')
			];

			const threadIds: string[] = [];

			for (let i = 0; i < seekerIds.length; i++) {
				const seekerId = seekerIds[i]!;
				await seedSeeker(db, seekerId, `Msg05 Seeker ${i + 1}`);
				const openedAt = new Date(baseTime.getTime() + i * 60_000);

				const opened = await sendOrHoldMessage(db, {
					seekerId,
					providerProfileId,
					body: `New enquiry ${i + 1}`,
					now: openedAt,
					correlationId: `corr-msg05-open-${i}`
				});
				expect(opened.ok).toBe(true);
				if (!opened.ok || opened.value.kind !== 'sent') throw new Error('open failed');
				threadIds.push(opened.value.threadId);

				const firstReplyAt = new Date(openedAt.getTime() + 10 * 60_000);
				const firstReply = await sendMessageInThread(db, {
					threadId: opened.value.threadId,
					senderId: providerOwnerId,
					body: `First reply ${i + 1}`,
					now: firstReplyAt,
					correlationId: `corr-msg05-first-${i}`
				});
				expect(firstReply.ok).toBe(true);
			}

			const beforeChatter = await getResponseTime(
				db,
				providerProfileId,
				new Date('2026-09-05T20:00:00Z')
			);
			expect(beforeChatter).toBe('within_30_min');

			const chatterThreadId = asId<'ThreadId'>(threadIds[0]!);
			for (let j = 0; j < 5; j++) {
				const slowReplyAt = new Date(baseTime.getTime() + (j + 2) * 24 * 60 * 60_000);
				const followUp = await sendMessageInThread(db, {
					threadId: chatterThreadId,
					senderId: providerOwnerId,
					body: `Ongoing chatter ${j + 1}`,
					now: slowReplyAt,
					correlationId: `corr-msg05-chatter-${j}`
				});
				expect(followUp.ok).toBe(true);
			}

			const afterChatter = await getResponseTime(
				db,
				providerProfileId,
				new Date('2026-09-20T10:00:00Z')
			);
			expect(afterChatter).toBe('within_30_min');
		});
	});
});
