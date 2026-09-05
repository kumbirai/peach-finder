import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../../scripts/seed-core';
import { asId } from '../../../shared/ids';
import { users } from '../../identity-and-access/infra/schema';
import type { Database } from '../../../db';
import { sendOrHoldMessage, threadExistsForSeekerProvider } from './messaging-commands';
import { applyMessagingRateLimitsBeforeSend } from './messaging-rate-limits';
import { bucketSpec } from '../../../shared/rate-limit';

async function seedSeeker(db: Database, id: string, displayName: string): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			displayName,
			email: `${id}@example.com`,
			emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
			status: 'active'
		})
		.onConflictDoNothing();
}

describe('applyMessagingRateLimitsBeforeSend', () => {
	it('consumes thread_create only when no thread exists yet', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009905');
			await seedSeeker(db, seekerId, 'Rate Limit Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			expect(await threadExistsForSeekerProvider(db, seekerId, providerProfileId)).toBe(false);

			const first = await applyMessagingRateLimitsBeforeSend(db, seekerId, providerProfileId, now);
			expect(first.ok).toBe(true);

			await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'First thread',
				now,
				correlationId: 'corr-rate-1'
			});

			expect(await threadExistsForSeekerProvider(db, seekerId, providerProfileId)).toBe(true);

			const second = await applyMessagingRateLimitsBeforeSend(
				db,
				seekerId,
				providerProfileId,
				new Date(now.getTime() + 1_000)
			);
			expect(second.ok).toBe(true);
		});
	});

	it('returns rate_limited when thread_create budget is exhausted for new contacts', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009906');
			await seedSeeker(db, seekerId, 'Thread Budget Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');
			const spec = bucketSpec('thread_create');

			for (let i = 0; i < spec.limit; i++) {
				const limited = await applyMessagingRateLimitsBeforeSend(
					db,
					seekerId,
					providerProfileId,
					new Date(now.getTime() + i)
				);
				expect(limited.ok).toBe(true);
			}

			const overBudget = await applyMessagingRateLimitsBeforeSend(
				db,
				seekerId,
				providerProfileId,
				new Date(now.getTime() + spec.limit)
			);
			expect(overBudget.ok).toBe(false);
			if (overBudget.ok || overBudget.error.kind !== 'rate_limited') {
				throw new Error('expected thread_create rate limit');
			}
		});
	});
});
