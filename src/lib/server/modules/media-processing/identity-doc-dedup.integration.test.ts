import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore, SEED_DUAL_ROLE_USER_ID } from '../../../../../scripts/seed-core';
import { SEED_VERIF_PENDING_OLD_OWNER_ID } from '../../../../../scripts/seed-verification-constants';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { storeIdentityDoc } from './index';
import { asId } from '../../shared/ids';

async function tinyJpeg(): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">
		<rect width="100%" height="100%" fill="#f5f0eb"/>
	</svg>`;
	const sharp = (await import('sharp')).default;
	return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

describe('identity doc upload deduplication', () => {
	it('reuses a photo id only for the same owner, not across accounts', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-id-dedup-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerA = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const ownerB = asId<'UserId'>(SEED_VERIF_PENDING_OLD_OWNER_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const bytes = await tinyJpeg();

			const firstA = await storeIdentityDoc(db, ownerA, bytes, now);
			const firstB = await storeIdentityDoc(db, ownerB, bytes, now);
			expect(firstA.ok).toBe(true);
			expect(firstB.ok).toBe(true);
			if (!firstA.ok || !firstB.ok) return;

			expect(firstB.value.photoId).not.toBe(firstA.value.photoId);

			const secondA = await storeIdentityDoc(db, ownerA, bytes, now);
			expect(secondA.ok).toBe(true);
			if (!secondA.ok) return;
			expect(secondA.value.photoId).toBe(firstA.value.photoId);
		});
	});
});
