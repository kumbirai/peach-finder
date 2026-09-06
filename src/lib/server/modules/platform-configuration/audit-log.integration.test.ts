import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { loadConfigCache, readAuditLog, seedPlatform, updateConfig } from './index';
import { resetConfigCacheForTests } from './infra/config-cache';
import { users } from '../identity-and-access/infra/schema';
import { asId } from '../../shared/ids';
import { SystemClock } from '../../shared/clock';
import { createAuthContext } from '../../shared/auth-context';
import { writeAudit } from '../../shared/audit';
import { isValidAuditCursor } from './infra/read-audit-log';
import { unpublishProfile } from '../trust-and-safety';
import {
	SEED_ADMIN_USER_ID,
	SEED_CORE_PRIMARY_PROFILE_ID,
	seedCore
} from '../../../../../scripts/seed-core';

const ADMIN_ID = asId<'UserId'>(SEED_ADMIN_USER_ID);
const PLATFORM_CONFIG_TARGET_ID = '00000000-0000-7000-8000-000000000000';

function adminActor() {
	return createAuthContext({
		userId: ADMIN_ID,
		role: 'admin',
		sessionId: null,
		ipAddress: '127.0.0.1'
	});
}

describe('US-ADMIN-07 audit log integration', () => {
	it('TC-ADMIN-07a: readAuditLog returns complete who/what/whom/when/reason entries', async () => {
		resetConfigCacheForTests();
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const configResult = await updateConfig(db, {
				key: 'listing-billing.trial_period_days',
				value: 18,
				actor: adminActor(),
				clock: new SystemClock(),
				correlationId: 'audit-config'
			});
			expect(configResult.ok).toBe(true);

			const moderationResult = await unpublishProfile(db, {
				adminId: ADMIN_ID,
				providerProfileId: asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				reason: 'Audit trail verification for unpublish.',
				correlationId: 'audit-unpublish',
				idempotencyKey: `audit-unpublish-${Date.now()}`,
				now: new Date('2026-09-06T12:00:00.000Z')
			});
			expect(moderationResult.ok).toBe(true);

			const configEntries = await readAuditLog(db, {
				targetType: 'platform_config',
				targetId: PLATFORM_CONFIG_TARGET_ID
			});
			expect(configEntries.entries.length).toBeGreaterThanOrEqual(1);
			const configEntry = configEntries.entries.find((row) => row.action === 'config.change');
			expect(configEntry).toBeDefined();
			expect(configEntry!.actorId).toBe(ADMIN_ID);
			expect(configEntry!.actorDisplayName).toBeTruthy();
			expect(configEntry!.actorRole).toBe('admin');
			expect(configEntry!.targetType).toBe('platform_config');
			expect(configEntry!.targetId).toBe(PLATFORM_CONFIG_TARGET_ID);
			expect(configEntry!.occurredAt).toBeTruthy();
			expect(configEntry!.correlationId).toBe('audit-config');

			const profileEntries = await readAuditLog(db, {
				targetType: 'provider_profile',
				targetId: SEED_CORE_PRIMARY_PROFILE_ID
			});
			const unpublishEntry = profileEntries.entries.find(
				(row) => row.action === 'moderation.unpublish'
			);
			expect(unpublishEntry).toBeDefined();
			expect(unpublishEntry!.actorId).toBe(ADMIN_ID);
			expect(unpublishEntry!.reason).toBe('Audit trail verification for unpublish.');
			expect(unpublishEntry!.targetType).toBe('provider_profile');
			expect(unpublishEntry!.targetId).toBe(SEED_CORE_PRIMARY_PROFILE_ID);
		});
	}, 90_000);

	it('readAuditLog cursor pages are non-overlapping', async () => {
		await withTestDatabase(async (db) => {
			const targetId = '01900000-0000-7000-8000-0000000000aa';
			for (let i = 0; i < 3; i++) {
				await db.transaction(async (tx) => {
					await writeAudit(tx, {
						actorId: ADMIN_ID,
						actorRole: 'admin',
						action: `pagination.probe.${i}`,
						targetType: 'user',
						targetId,
						correlationId: `pagination-${i}`
					});
				});
			}

			const firstPage = await readAuditLog(db, { targetType: 'user', targetId }, { limit: 2 });
			expect(firstPage.entries).toHaveLength(2);
			expect(firstPage.nextCursor).toBeTruthy();

			const secondPage = await readAuditLog(
				db,
				{ targetType: 'user', targetId },
				{ limit: 2, cursor: firstPage.nextCursor! }
			);
			expect(secondPage.entries.length).toBeGreaterThanOrEqual(1);

			const firstIds = new Set(firstPage.entries.map((row) => row.id));
			for (const row of secondPage.entries) {
				expect(firstIds.has(row.id)).toBe(false);
			}
		});
	}, 90_000);

	it('isValidAuditCursor rejects malformed tokens', () => {
		expect(isValidAuditCursor('not-a-cursor')).toBe(false);
		expect(
			isValidAuditCursor(
				Buffer.from(JSON.stringify({ occurredAt: '2026-09-06T12:00:00.000Z', id: 'x' }), 'utf8').toString(
					'base64url'
				)
			)
		).toBe(true);
	});

	it('TC-ADMIN-07b: audit log is append-only at the database level', async () => {
		await withTestDatabase(async (db) => {
			let auditId = '';
			await db.transaction(async (tx) => {
				auditId = await writeAudit(tx, {
					actorId: ADMIN_ID,
					actorRole: 'admin',
					action: 'moderation.suspend',
					targetType: 'user',
					targetId: '01900000-0000-7000-8000-000000000001',
					reason: 'Append-only check',
					correlationId: 'append-only'
				});
			});

			const appUrl = new URL(process.env.DATABASE_URL ?? '');
			appUrl.username = 'peach_app';
			appUrl.password = 'secret';
			const appSql = postgres(appUrl.toString(), { max: 1 });
			try {
				await expect(
					appSql`update shared.audit_log set reason = 'tampered' where id = ${auditId}`
				).rejects.toThrow();
				await expect(appSql`delete from shared.audit_log where id = ${auditId}`).rejects.toThrow();
			} finally {
				await appSql.end();
			}
		});
	}, 90_000);
});
