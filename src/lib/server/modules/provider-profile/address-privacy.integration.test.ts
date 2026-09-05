import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { SEED_CORE_PRIMARY_PROFILE_ID, seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { anonymousAuth } from '../../shared/auth-context';
import { asId } from '../../shared/ids';
import { getPublicProfile } from '../provider-profile';

const FORBIDDEN_API_KEYS = [
	'address',
	'street',
	'streetAddress',
	'line1',
	'line_1',
	'postcode',
	'postalCode',
	'exactLocation'
] as const;

function assertNoAddressKeys(payload: Record<string, unknown>) {
	for (const key of FORBIDDEN_API_KEYS) {
		expect(key in payload).toBe(false);
		expect(payload[key]).toBeUndefined();
	}
	const serialized = JSON.stringify(payload);
	for (const key of FORBIDDEN_API_KEYS) {
		expect(serialized).not.toContain(`"${key}"`);
	}
}

describe('US-PRIV-02 address privacy', () => {
	it('TC-PRIV-02a: provider_profile and platform_configuration schemas have no street-address columns', async () => {
		await withTestDatabase(async (db) => {
			const rows = await db.execute<{
				table_schema: string;
				table_name: string;
				column_name: string;
			}>(
				sql`
					select table_schema, table_name, column_name
					from information_schema.columns
					where table_schema in ('provider_profile', 'platform_configuration')
					  and (
					    column_name ilike '%street%'
					    or column_name ilike '%address%'
					    or column_name ilike '%postcode%'
					    or column_name ilike '%postal%'
					    or column_name ilike '%line1%'
					    or column_name ilike '%line_1%'
					  )
				`
			);

			expect(rows as unknown as unknown[]).toEqual([]);
		});
	});

	it('TC-PRIV-02a: public profile API exposes area only, never a street address', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profile = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(profile.ok).toBe(true);
			if (!profile.ok) throw new Error('profile read failed');

			const dto = profile.value as unknown as Record<string, unknown>;
			assertNoAddressKeys(dto);
			expect(dto.area).toBeTruthy();
			expect(typeof (dto.area as { name: string }).name).toBe('string');
			expect(typeof (dto.area as { slug: string }).slug).toBe('string');
		});
	});
});
