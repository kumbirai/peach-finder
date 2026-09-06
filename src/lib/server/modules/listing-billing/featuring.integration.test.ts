import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import {
	seedCore,
	SEED_DUAL_ROLE_PROFILE_ID,
	SEED_DUAL_ROLE_USER_ID
} from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { asId } from '../../shared/ids';
import {
	cancelFeaturingRenewalForOwner,
	completeFeaturingPurchaseForOwner,
	getSelfServeBillingForOwner,
	purchaseFeaturingForOwner,
	runBillingLifecycleTick
} from './index';
import { getFakePaymentGateway, resetFakePaymentGateway } from './infra/fake-payment-gateway';
import { featuringAddons, listings } from './infra/schema';
import { getActiveFeaturing } from './infra/featuring-read';
import { searchProjection } from '../discovery-search/infra/schema';
import { applyListingBillingTransition } from './infra/billing-transitions';
import { dispatchUndispatchedBillingSubscribers } from './infra/dev-dispatch';

describe('US-BILL-05 buy fair featuring integration', () => {
	it('TC-BILL-05a: featuring purchase blocked when listing is not active', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const gateway = getFakePaymentGateway('http://127.0.0.1:5173');

			await db
				.update(listings)
				.set({
					state: 'unpublished',
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: 'AUTH_test',
					updatedAt: new Date()
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const blocked = await purchaseFeaturingForOwner(
				db,
				ownerId,
				gateway,
				'corr-bill-05a',
				new Date()
			);
			expect(blocked.ok).toBe(false);
			if (!blocked.ok) {
				expect(blocked.error.kind).toBe('precondition_failed');
			}
		});
	});

	it('TC-BILL-05b: listing lapse force-lapses featuring in the same transaction', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const gateway = getFakePaymentGateway('http://127.0.0.1:5173');
			const now = new Date('2026-09-01T00:00:00.000Z');

			await db
				.update(listings)
				.set({
					state: 'paid_listed',
					currentPeriodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: 'AUTH_test',
					cardLast4: '4242',
					cardBrand: 'Visa',
					updatedAt: now
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const purchase = await purchaseFeaturingForOwner(
				db,
				ownerId,
				gateway,
				'corr-bill-05b-purchase',
				now
			);
			expect(purchase.ok).toBe(true);
			if (!purchase.ok) return;

			const activated = await completeFeaturingPurchaseForOwner(
				db,
				ownerId,
				purchase.value.reference,
				'corr-bill-05b-activate',
				now,
				'evt_featuring_05b'
			);
			expect(activated.ok).toBe(true);
			await dispatchUndispatchedBillingSubscribers(db);

			const activeFeaturing = await getActiveFeaturing(
				db,
				asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID)
			);
			expect(activeFeaturing).not.toBeNull();

			const projectionBefore = await db
				.select({ isFeatured: searchProjection.isFeatured })
				.from(searchProjection)
				.where(eq(searchProjection.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(projectionBefore[0]?.isFeatured).toBe(true);

			await db.transaction(async (tx) => {
				await applyListingBillingTransition(tx, {
					providerProfileId: asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID),
					kind: 'paid_listed_to_grace',
					now,
					correlationId: 'corr-bill-05b-grace'
				});
			});
			await dispatchUndispatchedBillingSubscribers(db);

			const lapsedFeaturing = await db
				.select()
				.from(featuringAddons)
				.where(
					and(
						eq(featuringAddons.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID),
						eq(featuringAddons.state, 'lapsed')
					)
				);
			expect(lapsedFeaturing.length).toBeGreaterThan(0);
			expect(
				await getActiveFeaturing(db, asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID))
			).toBeNull();

			const projectionAfter = await db
				.select({ isFeatured: searchProjection.isFeatured })
				.from(searchProjection)
				.where(eq(searchProjection.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID))
				.limit(1);
			expect(projectionAfter[0]?.isFeatured).toBe(false);
		});
	});

	it('TC-BILL-05c: canPurchase requires stored authorization code, not customer ref alone', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);

			await db
				.update(listings)
				.set({
					state: 'paid_listed',
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: null,
					cardLast4: '4242',
					cardBrand: 'Visa',
					updatedAt: new Date()
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const billing = await getSelfServeBillingForOwner(db, ownerId);
			expect(billing?.featuring.canPurchase).toBe(false);
			expect(billing?.paymentMethod.onFile).toBe(false);
		});
	});

	it('TC-BILL-05d: duplicate featuring purchase is rejected before charging again', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const gateway = getFakePaymentGateway('http://127.0.0.1:5173');
			const now = new Date('2026-09-01T00:00:00.000Z');

			await db
				.update(listings)
				.set({
					state: 'paid_listed',
					currentPeriodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: 'AUTH_test',
					cardLast4: '4242',
					cardBrand: 'Visa',
					updatedAt: now
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const purchase = await purchaseFeaturingForOwner(
				db,
				ownerId,
				gateway,
				'corr-bill-05d-purchase',
				now
			);
			expect(purchase.ok).toBe(true);
			if (!purchase.ok) return;

			await completeFeaturingPurchaseForOwner(
				db,
				ownerId,
				purchase.value.reference,
				'corr-bill-05d-activate',
				now,
				'evt_featuring_05d'
			);

			const duplicate = await purchaseFeaturingForOwner(
				db,
				ownerId,
				gateway,
				'corr-bill-05d-duplicate',
				now
			);
			expect(duplicate.ok).toBe(false);
			if (!duplicate.ok) {
				expect(duplicate.error.kind).toBe('conflict');
			}
		});
	});

	it('TC-BILL-03b: cancel featuring renewal keeps boost until period end', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const periodEnd = new Date('2026-10-15T00:00:00.000Z');
			const now = new Date();

			await db.insert(featuringAddons).values({
				id: crypto.randomUUID(),
				providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
				state: 'active',
				currentPeriodEndsAt: periodEnd,
				cancelAtPeriodEnd: false,
				createdAt: now,
				updatedAt: now
			});

			const cancel = await cancelFeaturingRenewalForOwner(db, ownerId, now);
			expect(cancel.ok).toBe(true);

			const row = await getActiveFeaturing(
				db,
				asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID)
			);
			expect(row?.cancelAtPeriodEnd).toBe(true);
			expect(row?.currentPeriodEndsAt).toBe(periodEnd.toISOString());
		});
	});

	it('daily job lapses featuring when renewal period ends with cancel_at_period_end', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const past = new Date('2026-08-01T00:00:00.000Z');
			await db.insert(featuringAddons).values({
				id: crypto.randomUUID(),
				providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
				state: 'active',
				currentPeriodEndsAt: past,
				cancelAtPeriodEnd: true,
				createdAt: past,
				updatedAt: past
			});

			const tick = await runBillingLifecycleTick(
				db,
				new Date('2026-09-05T00:00:00.000Z'),
				'corr-feat-lapse'
			);
			expect(tick.featuringLapsed).toBe(1);
			expect(
				await getActiveFeaturing(db, asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID))
			).toBeNull();
		});
	});
});
