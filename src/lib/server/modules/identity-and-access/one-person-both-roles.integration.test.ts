import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD
} from '../../../../../scripts/seed-core';
import { loginPassword, resolveCapabilities, resolveRole, createSession } from './index';
import { listSeekerThreads, listProviderInbox } from '../direct-messaging';
import { listReviewsWrittenBySeeker } from '../provider-reviews';

describe('US-ACC-04 one person both roles integration', () => {
	it('TC-ACC-04a: dual-role user resolves provider capability and separates inbox data', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const login = await loginPassword(db, {
				email: SEED_DUAL_ROLE_EMAIL,
				password: SEED_DUAL_ROLE_PASSWORD
			});
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const now = new Date();
			const session = await createSession(db, {
				userId: login.value.userId,
				ipAddress: '127.0.0.1',
				userAgent: 'vitest',
				now
			});

			const caps = await resolveCapabilities(db, login.value.userId);
			expect(caps.isSeeker).toBe(true);
			expect(caps.isProvider).toBe(true);

			const providerRoute = await resolveRole({
				session: {
					sessionId: session.sessionId,
					userId: login.value.userId,
					isAdmin: false,
					status: 'active',
					lastSeenAt: now,
					expiresAt: new Date(now.getTime() + 86_400_000)
				},
				routeRequiredRole: 'provider'
			});
			expect(providerRoute.forbidden).toBe(false);
			expect(providerRoute.role).toBe('provider');

			const seekerThreads = await listSeekerThreads(db, login.value.userId);
			expect(seekerThreads.some((t) => t.counterpartName.includes('Amara'))).toBe(true);
			expect(
				seekerThreads.every((t) => !t.lastMessagePreview.includes('Are you free this afternoon'))
			).toBe(true);

			const providerInbox = await listProviderInbox(db, login.value.userId);
			expect(providerInbox.some((t) => t.counterpartName.includes('Seeker Sample'))).toBe(true);
			expect(
				providerInbox.every((t) => !t.lastMessagePreview.includes('looking for a deep tissue'))
			).toBe(true);

			const seekerReviews = await listReviewsWrittenBySeeker(db, login.value.userId);
			expect(seekerReviews.some((r) => r.body.includes('seeker review only'))).toBe(true);
			expect(seekerReviews.every((r) => !r.body.includes('Professional and welcoming'))).toBe(true);
		});
	});

	it('listProviderInbox uses the passed database handle for profile ownership', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const login = await loginPassword(db, {
				email: SEED_DUAL_ROLE_EMAIL,
				password: SEED_DUAL_ROLE_PASSWORD
			});
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const inbox = await listProviderInbox(db, login.value.userId);
			expect(inbox.length).toBeGreaterThan(0);
			expect(inbox.some((t) => t.counterpartName.includes('Seeker Sample'))).toBe(true);
		});
	});
});
