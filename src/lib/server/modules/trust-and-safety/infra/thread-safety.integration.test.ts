import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../../scripts/seed-core';
import { asId } from '../../../shared/ids';
import { sendOrHoldMessage, getThreadForReport, isThreadParticipant } from '../../direct-messaging';
import { fileReport } from '../app/file-report';
import { blockUser } from '../app/block-user';
import { blocks, reports } from './schema';
import type { Database } from '../../../db';
import { users } from '../../identity-and-access/infra/schema';
import { outbox } from '../../../shared/schema';

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

describe('US-MSG-06 trust-and-safety thread actions', () => {
	it('TC-MSG-06 backend: thread report and block endpoints persist and emit events', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a606');
			await seedSeeker(db, seekerId, 'Msg06 Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Safety action thread',
				now,
				correlationId: 'corr-msg06'
			});
			expect(sent.ok).toBe(true);
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const threadId = sent.value.threadId;
			expect(await isThreadParticipant(db, threadId, seekerId)).toBe(true);

			const participants = await getThreadForReport(db, threadId);
			expect(participants?.participantIds).toHaveLength(2);

			const report = await fileReport(db, {
				reporterId: seekerId,
				targetType: 'thread',
				targetId: threadId,
				reason: 'harassment',
				now,
				correlationId: 'corr-report06'
			});
			expect(report.ok).toBe(true);
			if (!report.ok) throw new Error('report failed');

			const reportRows = await db
				.select()
				.from(reports)
				.where(eq(reports.id, report.value.reportId));
			expect(reportRows).toHaveLength(1);
			expect(reportRows[0]?.status).toBe('open');

			const providerOwnerId = participants!.participantIds.find((id) => id !== seekerId)!;
			const blocked = await blockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now: new Date(now.getTime() + 1000),
				correlationId: 'corr-block06'
			});
			expect(blocked.ok).toBe(true);

			const blockRows = await db.select().from(blocks).where(eq(blocks.blockerId, seekerId));
			expect(blockRows).toHaveLength(1);

			const events = await db.select().from(outbox);
			expect(events.some((event) => event.eventName === 'ReportFiled')).toBe(true);
			expect(events.some((event) => event.eventName === 'UserBlocked')).toBe(true);
		});
	});

	it('rejects thread reports from non-participants', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a607');
			const outsiderId = asId<'UserId'>('01900000-0000-7000-8000-00000000a608');
			await seedSeeker(db, seekerId, 'Msg06 Seeker');
			await seedSeeker(db, outsiderId, 'Msg06 Outsider');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Private thread',
				now,
				correlationId: 'corr-msg06b'
			});
			expect(sent.ok).toBe(true);
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const report = await fileReport(db, {
				reporterId: outsiderId,
				targetType: 'thread',
				targetId: sent.value.threadId,
				reason: 'harassment',
				now,
				correlationId: 'corr-report06b'
			});
			expect(report.ok).toBe(false);
			if (report.ok || report.error.kind !== 'not_found') throw new Error('expected not_found');
		});
	});

	it('rejects self-block attempts with validation_failed', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a60a');
			await seedSeeker(db, seekerId, 'Msg06 Self Block');
			const now = new Date('2026-09-05T12:00:00Z');

			const blocked = await blockUser(db, {
				blockerId: seekerId,
				blockedId: seekerId,
				now,
				correlationId: 'corr-self-block'
			});
			expect(blocked.ok).toBe(false);
			if (blocked.ok || blocked.error.kind !== 'validation_failed') {
				throw new Error('expected validation_failed');
			}
		});
	});

	it('idempotent block emits UserBlocked only once', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a60b');
			await seedSeeker(db, seekerId, 'Msg06 Idempotent');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Idempotent block thread',
				now,
				correlationId: 'corr-idempotent'
			});
			expect(sent.ok).toBe(true);
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const participants = await getThreadForReport(db, sent.value.threadId);
			const providerOwnerId = participants!.participantIds.find((id) => id !== seekerId)!;

			const first = await blockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now,
				correlationId: 'corr-block-once-1'
			});
			expect(first.ok).toBe(true);

			const second = await blockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now: new Date(now.getTime() + 1000),
				correlationId: 'corr-block-once-2'
			});
			expect(second.ok).toBe(true);

			const blockEvents = await db.select().from(outbox).where(eq(outbox.eventName, 'UserBlocked'));
			expect(blockEvents).toHaveLength(1);
		});
	});

	it('rejects block when blocked user does not exist', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a60c');
			await seedSeeker(db, seekerId, 'Msg06 Ghost Block');
			const now = new Date('2026-09-05T12:00:00Z');

			const blocked = await blockUser(db, {
				blockerId: seekerId,
				blockedId: asId<'UserId'>('01900000-0000-7000-8000-00000000ffff'),
				now,
				correlationId: 'corr-ghost-block'
			});
			expect(blocked.ok).toBe(false);
			if (blocked.ok || blocked.error.kind !== 'validation_failed') {
				throw new Error('expected validation_failed for unknown blocked user');
			}
		});
	});
});
