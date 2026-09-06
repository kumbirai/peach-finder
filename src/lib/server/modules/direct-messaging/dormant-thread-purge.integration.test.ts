import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import type { Database } from '../../db';
import { users } from '../identity-and-access/infra/schema';
import { sendOrHoldMessage } from './infra/messaging-commands';
import { purgeDormantThreads } from './infra/dormant-thread-purge-job';
import { messages, threads } from './infra/schema';
import { DORMANT_THREAD_MONTHS } from './domain/dormant-thread-retention';

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

function monthsAgo(now: Date, months: number): Date {
	const value = new Date(now);
	value.setUTCMonth(value.getUTCMonth() - months);
	return value;
}

describe('US-PRIV-03 dormant-thread purge integration', () => {
	it('TC-PRIV-03b: dormant threads purge at 24 months, not at 23 months', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const dormantSeekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009801');
			const activeSeekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009802');
			await seedSeeker(db, dormantSeekerId, 'Dormant Seeker');
			await seedSeeker(db, activeSeekerId, 'Active Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

			const dormantAt = monthsAgo(now, DORMANT_THREAD_MONTHS);
			const activeAt = monthsAgo(now, DORMANT_THREAD_MONTHS - 1);

			const dormantThread = await sendOrHoldMessage(db, {
				seekerId: dormantSeekerId,
				providerProfileId,
				body: 'Old dormant thread',
				now: dormantAt,
				correlationId: 'priv-03b-dormant'
			});
			expect(dormantThread.ok).toBe(true);
			if (!dormantThread.ok || dormantThread.value.kind !== 'sent') return;

			const activeThread = await sendOrHoldMessage(db, {
				seekerId: activeSeekerId,
				providerProfileId,
				body: 'Still active thread',
				now: activeAt,
				correlationId: 'priv-03b-active'
			});
			expect(activeThread.ok).toBe(true);
			if (!activeThread.ok || activeThread.value.kind !== 'sent') return;

			const purge = await purgeDormantThreads(db, now);
			expect(purge.threadsPurged).toBeGreaterThanOrEqual(1);

			const dormantRows = await db
				.select({ id: threads.id })
				.from(threads)
				.where(eq(threads.seekerId, dormantSeekerId));
			expect(dormantRows).toHaveLength(0);

			const dormantMessages = await db
				.select({ id: messages.id })
				.from(messages)
				.where(eq(messages.threadId, dormantThread.value.threadId));
			expect(dormantMessages).toHaveLength(0);

			const activeRows = await db
				.select({ id: threads.id })
				.from(threads)
				.where(eq(threads.seekerId, activeSeekerId));
			expect(activeRows).toHaveLength(1);
		});
	});

	it('retains dormant threads when a participant account is deleted', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009803');
			await seedSeeker(db, seekerId, 'Deleted Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const dormantAt = monthsAgo(now, DORMANT_THREAD_MONTHS);

			const opened = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Thread with deleted seeker',
				now: dormantAt,
				correlationId: 'priv-03b-deleted'
			});
			expect(opened.ok).toBe(true);
			if (!opened.ok || opened.value.kind !== 'sent') return;

			await db
				.update(users)
				.set({ status: 'deleted', deletedAt: dormantAt })
				.where(eq(users.id, seekerId));

			const purge = await purgeDormantThreads(db, now);
			expect(purge.threadsPurged).toBe(0);

			const rows = await db
				.select({ id: threads.id })
				.from(threads)
				.where(eq(threads.seekerId, seekerId));
			expect(rows).toHaveLength(1);
		});
	});
});
