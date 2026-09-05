import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import { getSafetyInfo } from '../app/get-safety-info';

describe('getSafetyInfo', () => {
	it('returns admin-authored safety HTML from platform configuration', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const info = getSafetyInfo();
			expect(info.html).toContain('Meet in a public');
			expect(info.html).toContain('Report anyone');
		});
	});
});
