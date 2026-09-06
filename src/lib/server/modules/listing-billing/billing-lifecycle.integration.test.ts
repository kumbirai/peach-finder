import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import {
	seedCore,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { listings, processedWebhooks } from './infra/schema';
import { runBillingLifecycleTick } from './infra/daily-lifecycle-job';
import { processPaystackWebhook } from './infra/webhook-handler';
import { signFakeWebhookPayload } from './infra/webhook-signature';
import { providerProfiles } from '../provider-profile/infra/schema';
import { getFakePaymentGateway, resetFakePaymentGateway } from './infra/fake-payment-gateway';
import { publicAppOrigin } from '../../env';

describe('US-BILL-04 lapse lifecycle integration', () => {
	it('TC-BILL-04f: daily job transitions trial expiry to grace from stored timestamps', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const pastTrial = new Date('2026-08-20T00:00:00.000Z');
			await db
				.update(listings)
				.set({
					state: 'free_listed',
					trialEndsAt: pastTrial,
					updatedAt: new Date()
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const tick = await runBillingLifecycleTick(
				db,
				new Date('2026-09-01T00:00:00.000Z'),
				'corr-bill-04f'
			);
			expect(tick.trialToGrace).toBe(1);

			const row = await db
				.select()
				.from(listings)
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(row[0]?.state).toBe('grace');
			expect(row[0]?.graceEndsAt).toBeTruthy();
		});
	});

	it('TC-BILL-04b: grace expiry auto-unpublishes listing while retaining profile data', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await db
				.update(listings)
				.set({
					state: 'grace',
					graceEndsAt: new Date('2026-09-01T00:00:00.000Z'),
					updatedAt: new Date()
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const tick = await runBillingLifecycleTick(
				db,
				new Date('2026-09-02T00:00:00.000Z'),
				'corr-bill-04b'
			);
			expect(tick.graceToUnpublished).toBe(1);

			const listing = await db
				.select()
				.from(listings)
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(listing[0]?.state).toBe('unpublished');

			const profile = await db
				.select()
				.from(providerProfiles)
				.where(eq(providerProfiles.id, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(profile[0]?.intro).toBeTruthy();
		});
	});

	it('TC-BILL-04d/e: webhook signature + idempotency', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await db
				.update(listings)
				.set({
					state: 'grace',
					graceEndsAt: new Date('2026-09-20T00:00:00.000Z'),
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: 'AUTH_test',
					updatedAt: new Date()
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const gateway = getFakePaymentGateway(publicAppOrigin());
			const charge = await gateway.chargeAuthorization({
				authorizationCode: 'AUTH_test',
				customerCode: 'CUS_test',
				amountCents: 9900,
				metadata: { providerProfileId: SEED_DUAL_ROLE_PROFILE_ID }
			});
			expect(charge.ok).toBe(true);
			if (!charge.ok) return;

			const eventId = 'evt_bill_04d_test';
			const payload = gateway.buildWebhookPayload(charge.value.reference, eventId, 'charge.success');
			expect(payload).toBeTruthy();
			if (!payload) return;

			const badSig = signFakeWebhookPayload('{"tampered":true}');
			expect(badSig).not.toBe(payload.signature);

			const first = await processPaystackWebhook(
				db,
				JSON.parse(payload.body) as never,
				'corr-webhook-1',
				new Date()
			);
			expect(first.status).toBe('processed');

			const second = await processPaystackWebhook(
				db,
				JSON.parse(payload.body) as never,
				'corr-webhook-2',
				new Date()
			);
			expect(second.status).toBe('duplicate');

			const auditCount = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.audit_log
				where action = 'listing-billing.state_transition'
				  and target_id = ${SEED_DUAL_ROLE_PROFILE_ID}
			`);
			expect((auditCount as unknown as Array<{ count: number }>)[0]?.count).toBe(1);

			const webhookRows = await db.select().from(processedWebhooks);
			expect(webhookRows).toHaveLength(1);
		});
	});

	it('TC-BILL-04c: payment while unpublished moves to paid_listed', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await db
				.update(listings)
				.set({
					state: 'unpublished',
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: 'AUTH_test',
					cardLast4: '4242',
					cardBrand: 'Visa',
					updatedAt: new Date()
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const gateway = getFakePaymentGateway(publicAppOrigin());
			const charge = await gateway.chargeAuthorization({
				authorizationCode: 'AUTH_test',
				customerCode: 'CUS_test',
				amountCents: 9900,
				metadata: { providerProfileId: SEED_DUAL_ROLE_PROFILE_ID }
			});
			expect(charge.ok).toBe(true);
			if (!charge.ok) return;

			const payload = gateway.buildWebhookPayload(
				charge.value.reference,
				'evt_unpublished_pay',
				'charge.success'
			);
			expect(payload).toBeTruthy();
			if (!payload) return;

			const result = await processPaystackWebhook(
				db,
				JSON.parse(payload.body) as never,
				'corr-unpublished-pay',
				new Date()
			);
			expect(result.status).toBe('processed');

			const listing = await db
				.select()
				.from(listings)
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(listing[0]?.state).toBe('paid_listed');
			expect(listing[0]?.currentPeriodEndsAt).toBeTruthy();
		});
	});

	it('TC-BILL-04c-race: charge.success after grace lapsed still republishes from unpublished', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const gateway = getFakePaymentGateway(publicAppOrigin());
			const charge = await gateway.chargeAuthorization({
				authorizationCode: 'AUTH_test',
				customerCode: 'CUS_test',
				amountCents: 9900,
				metadata: { providerProfileId: SEED_DUAL_ROLE_PROFILE_ID }
			});
			expect(charge.ok).toBe(true);
			if (!charge.ok) return;

			await db
				.update(listings)
				.set({
					state: 'unpublished',
					graceEndsAt: new Date('2026-09-01T00:00:00.000Z'),
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: 'AUTH_test',
					updatedAt: new Date()
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const payload = gateway.buildWebhookPayload(
				charge.value.reference,
				'evt_grace_lapsed_pay',
				'charge.success'
			);
			expect(payload).toBeTruthy();
			if (!payload) return;

			const result = await processPaystackWebhook(
				db,
				JSON.parse(payload.body) as never,
				'corr-grace-lapsed-pay',
				new Date()
			);
			expect(result.status).toBe('processed');

			const listing = await db
				.select()
				.from(listings)
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(listing[0]?.state).toBe('paid_listed');
		});
	});
});
