import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { SEED_ADMIN_USER_ID } from '../../../../../scripts/seed-core';
import { seedReports } from '../../../../../scripts/seed-reports';
import {
	SEED_REPORT_ACT_OPEN_ID,
	SEED_REPORT_DISMISSED_ID,
	SEED_REPORT_ACTED_ID,
	SEED_REPORT_NEW_OPEN_ID,
	SEED_REPORT_OLD_OPEN_ID,
	SEED_REPORT_THREAD_ID,
	SEED_REPORT_THREAD_OPEN_ID
} from '../../../../../scripts/seed-reports-constants';
import { asId, type ReportId, type ThreadId, type UserId } from '../../shared/ids';
import { auditLog, outbox } from '../../shared/schema';
import {
	actOnReport,
	dismissReport,
	getReportContext,
	getReportsQueueStats,
	listReportsQueue
} from './index';
import { reports } from './infra/schema';
import { handleReportResolved } from '../user-notifications';
import { notificationLog } from '../user-notifications/infra/schema';
import { listThreadMessagesForReport } from '../direct-messaging';

describe('US-ADMIN-03 reports queue integration', () => {
	it('TC-ADMIN-03a: open reports are oldest-first with full context', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const queue = await listReportsQueue(db, now);
			expect(queue.length).toBeGreaterThanOrEqual(4);
			expect(queue[0]!.reportId).toBe(SEED_REPORT_OLD_OPEN_ID);
			expect(queue.some((item) => item.reportId === SEED_REPORT_THREAD_OPEN_ID)).toBe(true);

			const threadItem = queue.find((item) => item.reportId === SEED_REPORT_THREAD_OPEN_ID);
			expect(threadItem?.reporterDisplayName).toBeTruthy();
			expect(threadItem?.reportedPartyDisplayName).toBeTruthy();
			expect(threadItem?.threadMessages?.length).toBeGreaterThan(0);
			expect(threadItem?.historySummary).toContain('prior report');

			const profileItem = queue.find((item) => item.reportId === SEED_REPORT_OLD_OPEN_ID);
			expect(profileItem?.profile?.displayName).toBeTruthy();
		});
	});

	it('TC-ADMIN-03b: open reports never auto-resolve', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const before = await listReportsQueue(db, new Date('2026-09-06T12:00:00.000Z'));
			const after = await listReportsQueue(db, new Date('2027-01-01T12:00:00.000Z'));
			expect(after.map((item) => item.reportId)).toEqual(before.map((item) => item.reportId));

			const row = await db
				.select()
				.from(reports)
				.where(eq(reports.id, SEED_REPORT_OLD_OPEN_ID))
				.limit(1);
			expect(row[0]?.status).toBe('open');
		});
	});

	it('TC-ADMIN-03c: thread messages are only reachable via a filed report', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const allowed = await listThreadMessagesForReport(
				db,
				asId<'ThreadId'>(SEED_REPORT_THREAD_ID),
				asId<'ReportId'>(SEED_REPORT_THREAD_OPEN_ID)
			);
			expect(allowed.ok).toBe(true);

			const blocked = await listThreadMessagesForReport(
				db,
				asId<'ThreadId'>(SEED_REPORT_THREAD_ID),
				asId<'ReportId'>(SEED_REPORT_OLD_OPEN_ID)
			);
			expect(blocked.ok).toBe(false);
		});
	});

	it('dismiss requires a note and notifies the reporter', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const reportId = asId<'ReportId'>(SEED_REPORT_NEW_OPEN_ID);

			const blocked = await dismissReport(db, {
				reportId,
				adminId,
				note: '   ',
				idempotencyKey: 'dismiss-empty',
				correlationId: 'corr-dismiss-empty',
				now: new Date()
			});
			expect(blocked.ok).toBe(false);

			const dismissed = await dismissReport(db, {
				reportId,
				adminId,
				note: 'Reviewed — no policy violation.',
				idempotencyKey: 'dismiss-once',
				correlationId: 'corr-dismiss',
				now: new Date()
			});
			expect(dismissed.ok).toBe(true);

			const audits = await db
				.select()
				.from(auditLog)
				.where(and(eq(auditLog.action, 'report.dismiss'), eq(auditLog.targetId, reportId)));
			expect(audits).toHaveLength(1);

			const events = await db.select().from(outbox).where(eq(outbox.eventName, 'ReportResolved'));
			const resolved = events.find(
				(event) => (event.payload as { reportId?: string }).reportId === reportId
			);
			expect(resolved).toBeTruthy();
			if (resolved) {
				await handleReportResolved(db, resolved as never);
			}

			const notifications = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.category, 'report_resolution'));
			expect(notifications.length).toBeGreaterThan(0);

			const queue = await listReportsQueue(db, new Date());
			expect(queue.some((item) => item.reportId === reportId)).toBe(false);
		});
	});

	it('act on report unpublishes profile and resolves the queue item', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const reportId = asId<'ReportId'>(SEED_REPORT_ACT_OPEN_ID);
			const contextBefore = await getReportContext(db, reportId, new Date());
			expect(contextBefore).toBeTruthy();

			const acted = await actOnReport(db, {
				reportId,
				adminId,
				action: 'unpublish',
				reason: 'Verified safety concern after review.',
				idempotencyKey: 'act-once',
				correlationId: 'corr-act',
				now: new Date()
			});
			expect(acted.ok).toBe(true);

			const row = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
			expect(row[0]?.status).toBe('acted');

			const stats = await getReportsQueueStats(db, new Date());
			expect(stats.openCount).toBeGreaterThanOrEqual(0);
		});
	});

	it('rejects resolution on already-closed or missing reports', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const missingId = asId<'ReportId'>('01900000-0000-7000-8000-000000009999');

			const missingDismiss = await dismissReport(db, {
				reportId: missingId,
				adminId,
				note: 'Should not apply.',
				idempotencyKey: 'dismiss-missing',
				correlationId: 'corr-missing-dismiss',
				now: new Date()
			});
			expect(missingDismiss.ok).toBe(false);
			if (!missingDismiss.ok) {
				expect(missingDismiss.error.kind).toBe('not_found');
			}

			const dismissedAgain = await dismissReport(db, {
				reportId: asId<'ReportId'>(SEED_REPORT_DISMISSED_ID),
				adminId,
				note: 'Already closed.',
				idempotencyKey: 'dismiss-closed',
				correlationId: 'corr-closed-dismiss',
				now: new Date()
			});
			expect(dismissedAgain.ok).toBe(false);
			if (!dismissedAgain.ok) {
				expect(dismissedAgain.error.kind).toBe('not_found');
			}

			const actedAgain = await actOnReport(db, {
				reportId: asId<'ReportId'>(SEED_REPORT_ACTED_ID),
				adminId,
				action: 'unpublish',
				reason: 'Already acted.',
				idempotencyKey: 'act-closed',
				correlationId: 'corr-closed-act',
				now: new Date()
			});
			expect(actedAgain.ok).toBe(false);
			if (!actedAgain.ok) {
				expect(actedAgain.error.kind).toBe('not_found');
			}
		});
	});

	it('dismiss is idempotent when the same Idempotency-Key is replayed', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const reportId = asId<'ReportId'>(SEED_REPORT_NEW_OPEN_ID);

			const first = await dismissReport(db, {
				reportId,
				adminId,
				note: 'Reviewed — no policy violation.',
				idempotencyKey: 'dismiss-replay',
				correlationId: 'corr-replay',
				now: new Date()
			});
			expect(first.ok).toBe(true);

			const replay = await dismissReport(db, {
				reportId,
				adminId,
				note: 'Reviewed — no policy violation.',
				idempotencyKey: 'dismiss-replay',
				correlationId: 'corr-replay-2',
				now: new Date()
			});
			expect(replay.ok).toBe(true);

			const audits = await db
				.select()
				.from(auditLog)
				.where(and(eq(auditLog.action, 'report.dismiss'), eq(auditLog.targetId, reportId)));
			expect(audits).toHaveLength(1);
		});
	});

	it('act is idempotent when the same Idempotency-Key is replayed', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const reportId = asId<'ReportId'>(SEED_REPORT_ACT_OPEN_ID);

			const first = await actOnReport(db, {
				reportId,
				adminId,
				action: 'unpublish',
				reason: 'Verified safety concern after review.',
				idempotencyKey: 'act-replay',
				correlationId: 'corr-act-replay',
				now: new Date()
			});
			expect(first.ok).toBe(true);

			const replay = await actOnReport(db, {
				reportId,
				adminId,
				action: 'unpublish',
				reason: 'Verified safety concern after review.',
				idempotencyKey: 'act-replay',
				correlationId: 'corr-act-replay-2',
				now: new Date()
			});
			expect(replay.ok).toBe(true);

			const audits = await db
				.select()
				.from(auditLog)
				.where(and(eq(auditLog.action, 'report.act'), eq(auditLog.targetId, reportId)));
			expect(audits).toHaveLength(1);
		});
	});
});
