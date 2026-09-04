import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { registerSeeker, verifyEmailToken, isEmailVerified } from './infra/auth-commands';
import {
	sendOrHoldMessage,
	getThreadForSeekerProvider,
	releaseHeldMessagesForUser
} from '../direct-messaging';
import { asId } from '../../shared/ids';

describe('US-ACC-02 sign-up mid-action integration', () => {
	it('TC-ACC-02c: held message releases on email verification', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date();
			const email = `seeker-${Date.now()}@example.com`;
			const reg = await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Test Seeker',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok) return;
			expect(reg.value.accountCreated).toBe(true);
			if (!reg.value.userId) return;

			const providerId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const draft = 'Hi, are you available this afternoon?';

			const held = await sendOrHoldMessage(db, {
				seekerId: reg.value.userId,
				providerProfileId: providerId,
				body: draft,
				now,
				correlationId: 'test-corr-2'
			});
			expect(held.ok).toBe(true);
			if (!held.ok) return;
			expect(held.value.kind).toBe('held');

			let thread = await getThreadForSeekerProvider(db, reg.value.userId, providerId);
			expect(thread).toBeNull();

			expect(await isEmailVerified(db, reg.value.userId)).toBe(false);
			expect(reg.value.verificationToken).toBeTruthy();

			const verified = await verifyEmailToken(db, reg.value.verificationToken!, now, 'test-corr-3');
			expect(verified.ok).toBe(true);

			await releaseHeldMessagesForUser(db, reg.value.userId, now, 'test-corr-4');

			thread = await getThreadForSeekerProvider(db, reg.value.userId, providerId);
			expect(thread).not.toBeNull();
			expect(thread!.messages.some((m) => m.body === draft)).toBe(true);
		});
	});

	it('replaces an unreleased pending message instead of duplicating on resend', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date();
			const email = `pending-upsert-${Date.now()}@example.com`;
			const reg = await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Test Seeker',
					acceptedTerms: true
				},
				now,
				'test-corr-upsert'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.userId) return;

			const providerId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const firstDraft = 'First draft';
			const secondDraft = 'Updated draft';

			const firstHold = await sendOrHoldMessage(db, {
				seekerId: reg.value.userId,
				providerProfileId: providerId,
				body: firstDraft,
				now,
				correlationId: 'test-corr-upsert-2'
			});
			const secondHold = await sendOrHoldMessage(db, {
				seekerId: reg.value.userId,
				providerProfileId: providerId,
				body: secondDraft,
				now,
				correlationId: 'test-corr-upsert-3'
			});
			expect(firstHold.ok && secondHold.ok).toBe(true);
			if (!firstHold.ok || !secondHold.ok) return;
			expect(firstHold.value.kind).toBe('held');
			expect(secondHold.value.kind).toBe('held');
			if (firstHold.value.kind !== 'held' || secondHold.value.kind !== 'held') return;
			expect(secondHold.value.pendingId).toBe(firstHold.value.pendingId);

			const verified = await verifyEmailToken(
				db,
				reg.value.verificationToken!,
				now,
				'test-corr-upsert-4'
			);
			expect(verified.ok).toBe(true);

			await releaseHeldMessagesForUser(db, reg.value.userId, now, 'test-corr-upsert-5');

			const thread = await getThreadForSeekerProvider(db, reg.value.userId, providerId);
			expect(thread?.messages).toHaveLength(1);
			expect(thread?.messages[0]?.body).toBe(secondDraft);
		});
	});
});
