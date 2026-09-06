import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId, newId } from '../../shared/ids';
import { asInstant } from '../../shared/clock';
import { publish } from '../../shared/outbox';
import { outbox } from '../../shared/schema';
import { reviews } from '../provider-reviews/infra/schema';
import { users } from '../identity-and-access/infra/schema';
import { sendOrHoldMessage } from '../direct-messaging';
import { dispatchUndispatchedNotificationSubscribers, handleMessageSent, catchUpMessageSentNotificationLedger } from './index';
import { notificationLog } from './infra/schema';

const PROVIDER_OWNER_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
const PRIMARY_PROFILE_ID = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

describe('dev notification dispatch helper', () => {
	it('marks notification-only outbox events dispatched after handling', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const reportId = newId<'ReportId'>();
			const eventId = newId<'OutboxEventId'>();
			await db.transaction(async (tx) => {
				await publish(tx, {
					eventId,
					eventName: 'ReportFiled',
					version: 1,
					occurredAt: asInstant('2026-09-05T14:00:00Z'),
					correlationId: 'corr-report-dev',
					payload: {
						reportId,
						reporterId: PROVIDER_OWNER_ID,
						targetType: 'profile',
						targetId: PRIMARY_PROFILE_ID
					}
				});
			});

			const handled = await dispatchUndispatchedNotificationSubscribers(db);
			expect(handled).toBe(1);

			const [row] = await db.select().from(outbox).where(eq(outbox.eventId, eventId));
			expect(row?.dispatchedAt).not.toBeNull();

			const notifRows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.category, 'report_receipt'));
			expect(notifRows).toHaveLength(1);
		});
	});

	it('does not mark mixed-subscriber outbox events dispatched', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000b601');
			await db
				.insert(users)
				.values({
					id: seekerId,
					displayName: 'Review Seeker',
					email: 'review-seeker@example.com',
					emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
					status: 'active'
				})
				.onConflictDoNothing();
			const reviewId = newId<'ReviewId'>();
			await db.insert(reviews).values({
				id: reviewId,
				providerProfileId: PRIMARY_PROFILE_ID,
				reviewerId: seekerId,
				rating: 4,
				body: 'Solid session',
				createdAt: new Date('2026-09-05T14:00:00Z')
			});

			const eventId = newId<'OutboxEventId'>();
			await db.transaction(async (tx) => {
				await publish(tx, {
					eventId,
					eventName: 'ReviewSubmitted',
					version: 1,
					occurredAt: asInstant('2026-09-05T14:00:00Z'),
					correlationId: 'corr-review-dev',
					payload: {
						reviewId,
						providerProfileId: PRIMARY_PROFILE_ID,
						rating: 4
					}
				});
			});

			const handled = await dispatchUndispatchedNotificationSubscribers(db);
			expect(handled).toBe(0);

			const [row] = await db.select().from(outbox).where(eq(outbox.eventId, eventId));
			expect(row?.dispatchedAt).toBeNull();

			const notifRows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.category, 'review_received'));
			expect(notifRows).toHaveLength(2);
		});
	});

	it('does not replay MessageSent events already processed by new-message subscriber', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000b602');
			await db
				.insert(users)
				.values({
					id: seekerId,
					displayName: 'Replay Guard Seeker',
					email: 'replay-guard@example.com',
					emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
					status: 'active'
				})
				.onConflictDoNothing();

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: PRIMARY_PROFILE_ID,
				body: 'Already processed',
				now: new Date('2026-09-05T14:00:00Z'),
				correlationId: 'corr-replay-guard'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const [messageSentRow] = await db
				.select({ eventId: outbox.eventId })
				.from(outbox)
				.where(eq(outbox.correlationId, 'corr-replay-guard'))
				.limit(1);
			if (!messageSentRow) throw new Error('MessageSent outbox row missing');

			await handleMessageSent(
				db,
				{
					eventId: messageSentRow.eventId,
					eventName: 'MessageSent',
					version: 1,
					occurredAt: asInstant('2026-09-05T14:00:00Z'),
					correlationId: 'corr-replay-guard',
					payload: {
						threadId: sent.value.threadId,
						messageId: sent.value.messageId,
						senderId: seekerId
					}
				} as never
			);

			const beforeRows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.userId, PROVIDER_OWNER_ID));
			expect(beforeRows.filter((row) => row.channel === 'in_app')).toHaveLength(1);

			await dispatchUndispatchedNotificationSubscribers(db);
			await dispatchUndispatchedNotificationSubscribers(db);

			const afterRows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.userId, PROVIDER_OWNER_ID));
			expect(afterRows.filter((row) => row.channel === 'in_app')).toHaveLength(1);
		});
	});

	it('catchUpMessageSentNotificationLedger marks backlog without duplicate fan-out', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000b603');
			await db
				.insert(users)
				.values({
					id: seekerId,
					displayName: 'Catch-up Seeker',
					email: 'catch-up@example.com',
					emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
					status: 'active'
				})
				.onConflictDoNothing();

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: PRIMARY_PROFILE_ID,
				body: 'Backlog row',
				now: new Date('2026-09-05T14:00:00Z'),
				correlationId: 'corr-catch-up'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const marked = await catchUpMessageSentNotificationLedger(db);
			expect(marked).toBe(1);

			const handled = await dispatchUndispatchedNotificationSubscribers(db);
			expect(handled).toBe(0);

			const rows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.userId, PROVIDER_OWNER_ID));
			expect(rows.filter((row) => row.channel === 'in_app')).toHaveLength(0);
		});
	});
});
