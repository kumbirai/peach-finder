import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../../db/test-harness';
import { listAreas, seedPlatform } from '../../platform-configuration';
import { requireActiveRegistrationArea } from './provider-registration-area';

describe('requireActiveRegistrationArea', () => {
	it('rejects unknown or inactive area ids', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			const result = await requireActiveRegistrationArea(
				db,
				'00000000-0000-7000-8000-000000000099'
			);
			expect(result.ok).toBe(false);
			if (!result.ok && result.error.kind === 'validation_failed') {
				expect(result.error.issues[0]?.path).toBe('areaId');
			}
		});
	});

	it('accepts an active seeded area', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.isActive)?.id;
			expect(areaId).toBeTruthy();
			const result = await requireActiveRegistrationArea(db, areaId!);
			expect(result.ok).toBe(true);
		});
	});
});
