import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, getConfig, loadConfigCache } from './index';
import { resetConfigCacheForTests } from './infra/config-cache';
import { config } from './infra/schema';
import { consumeRateLimit, bucketSpec } from '../../shared/rate-limit';
import { publish } from '../../shared/outbox';
import { dispatchUndispatched } from '../../../../worker/dispatch';
import { newId } from '../../shared/ids';
import { asInstant } from '../../shared/clock';
import { outbox, auditLog } from '../../shared/schema';
import { writeAudit } from '../../shared/audit';
import { hashSessionToken, findActiveSession } from '../identity-and-access';
import { sessions, users } from '../identity-and-access/infra/schema';

describe('foundation integration', () => {
	it('migrates, seeds config, outbox, rate-limit, and sessions', async () => {
		resetConfigCacheForTests();
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			expect(getConfig('listing-billing.trial_period_days')).toBe(14);
			expect(getConfig('provider-availability.expiry_minutes')).toBe(240);

			const rows = await db.select().from(config);
			expect(rows.length).toBeGreaterThanOrEqual(15);

			await db.transaction(async (tx) => {
				await publish(tx, {
					eventId: newId<'OutboxEventId'>(),
					eventName: 'ConfigChanged',
					version: 1,
					occurredAt: asInstant(new Date().toISOString()),
					payload: { configKey: 'listing-billing.trial_period_days', newValue: 14 },
					correlationId: 'test'
				});
				await writeAudit(tx, {
					actorId: null,
					actorRole: 'system',
					action: 'config.change',
					targetType: 'platform_config',
					targetId: '01900000-0000-7000-8000-000000000010',
					correlationId: 'test'
				});
			});
			const events = await db.select().from(outbox);
			expect(events.length).toBe(1);
			const jobs: Array<{ subscriber: string; eventName: string }> = [];
			await dispatchUndispatched(db, async (job) => {
				jobs.push({ subscriber: job.subscriber, eventName: job.event.eventName });
			});
			expect(jobs).toEqual([
				{ subscriber: 'platform-configuration.config-cache', eventName: 'ConfigChanged' }
			]);
			const dispatched = await db.select().from(outbox);
			expect(dispatched[0]?.dispatchedAt).not.toBeNull();
			const audits = await db.select().from(auditLog);
			expect(audits.length).toBe(1);

			const appUrl = new URL(process.env.DATABASE_URL ?? '');
			appUrl.username = 'peach_app';
			appUrl.password = 'secret';
			const appSql = postgres(appUrl.toString(), { max: 1 });
			try {
				await expect(
					appSql`update shared.audit_log set reason = 'nope' where id = ${audits[0]!.id}`
				).rejects.toThrow();
			} finally {
				await appSql.end();
			}

			const first = await consumeRateLimit(
				db,
				bucketSpec('search_query', 60_000, 2),
				'ip:1',
				new Date()
			);
			expect(first.ok).toBe(true);
			await consumeRateLimit(db, bucketSpec('search_query', 60_000, 2), 'ip:1', new Date());
			const blocked = await consumeRateLimit(
				db,
				bucketSpec('search_query', 60_000, 2),
				'ip:1',
				new Date()
			);
			expect(blocked.ok).toBe(false);
			if (!blocked.ok) expect(blocked.error.kind).toBe('rate_limited');

			const userId = newId<'UserId'>();
			const sessionId = newId<'SessionId'>();
			const token = 'a'.repeat(64);
			await db.insert(users).values({
				id: userId,
				isAdmin: false,
				email: 'seeker@example.com',
				displayName: 'Seeker',
				status: 'active',
				createdAt: new Date(),
				updatedAt: new Date()
			});
			await db.insert(sessions).values({
				id: sessionId,
				userId,
				tokenHash: hashSessionToken(token),
				createdAt: new Date(),
				lastSeenAt: new Date(),
				expiresAt: new Date(Date.now() + 60_000),
				ipAddress: '127.0.0.1'
			});
			const found = await findActiveSession(db, token, new Date());
			expect(found?.userId).toBe(userId);
		});
	}, 90_000);
});
