import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import {
	countExportAudits,
	exportUserData,
	loadConfigCache,
	seedPlatform
} from './index';
import { seedCore, SEED_DUAL_ROLE_USER_ID } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import { createAuthContext } from '../../shared/auth-context';
import { exportPayloadHasForbiddenMaterial } from './infra/export-sanitize';

const ADMIN_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000097');

describe('SR-DATA-07 exportUserData', () => {
	it('uses facade slices only, omits secrets, and is idempotent on the same key', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const actor = createAuthContext({
				userId: ADMIN_ID,
				role: 'admin',
				sessionId: null,
				ipAddress: '127.0.0.1'
			});
			const userId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const first = await exportUserData(userId, actor, db, 'export-1', 'export-same-key');
			const second = await exportUserData(userId, actor, db, 'export-2', 'export-same-key');

			expect(first.slices['identity-and-access']).toBeTruthy();
			expect(first.slices['listing-billing']).toBeTruthy();
			expect(exportPayloadHasForbiddenMaterial(first)).toBe(false);
			expect(JSON.stringify(first)).not.toMatch(/passwordHash|pspCustomerRef|identity-docs/);
			expect(second.generatedAt).toBe(first.generatedAt);
			expect(await countExportAudits(db, userId, 'export-same-key')).toBe(1);
		});
	}, 90_000);
});
