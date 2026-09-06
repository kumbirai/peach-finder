import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import {
	adminCreateServiceTag,
	adminRetireServiceTag,
	listServiceTagsForAdmin
} from './infra/admin-service-tag-commands';
import { serviceTags } from './infra/schema';
import { eq } from 'drizzle-orm';

describe('US-ADMIN-06 admin service tag commands integration', () => {
	it('creates and retires a service tag without deleting rows', async () => {
		await withTestDatabase(async (db) => {
			const created = await adminCreateServiceTag(db, { name: 'Prenatal massage' });
			expect(created.ok).toBe(true);
			if (!created.ok) return;

			const tags = await listServiceTagsForAdmin(db);
			const row = tags.find((tag) => tag.id === created.value.id);
			expect(row?.name).toBe('Prenatal massage');
			expect(row?.slug).toBe('prenatal-massage');
			expect(row?.isActive).toBe(true);

			const retired = await adminRetireServiceTag(db, { id: created.value.id });
			expect(retired.ok).toBe(true);

			const after = await db
				.select()
				.from(serviceTags)
				.where(eq(serviceTags.id, created.value.id))
				.limit(1);
			expect(after[0]?.isActive).toBe(false);
		});
	}, 90_000);
});
