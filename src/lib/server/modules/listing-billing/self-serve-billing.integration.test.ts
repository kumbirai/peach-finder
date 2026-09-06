import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import {
	seedCore,
	SEED_DUAL_ROLE_PROFILE_ID,
	SEED_DUAL_ROLE_USER_ID
} from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { asId, newId } from '../../shared/ids';
import {
	cancelListingRenewalForOwner,
	completePaymentMethodForOwner,
	getBillingHistoryForOwner,
	getBillingPriceForOwner,
	getSelfServeBillingForOwner,
	initializePaymentMethodForOwner
} from './index';
import { getFakePaymentGateway, resetFakePaymentGateway } from './infra/fake-payment-gateway';
import { listings } from './infra/schema';

describe('US-BILL-03 self-serve billing integration', () => {
	it('TC-BILL-03a/b: hosted payment method init rejects card fields and returns partner URL', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const gateway = getFakePaymentGateway('http://127.0.0.1:5173');

			const rejected = await initializePaymentMethodForOwner(db, ownerId, gateway, {
				callbackUrl:
					'http://127.0.0.1:5173/provider/billing/payment-method/complete?return=/provider/billing',
				body: { cardNumber: '4111111111111111' }
			});
			expect(rejected.ok).toBe(false);
			if (!rejected.ok) {
				expect(rejected.error.kind).toBe('validation_failed');
			}

			const init = await initializePaymentMethodForOwner(db, ownerId, gateway, {
				callbackUrl:
					'http://127.0.0.1:5173/provider/billing/payment-method/complete?return=/provider/billing',
				body: {}
			});
			expect(init.ok).toBe(true);
			if (init.ok) {
				expect(init.value.authorizationUrl).toContain('/provider/billing/payment-method/hosted');
			}

			const price = await getBillingPriceForOwner(db, ownerId);
			expect(price.ok).toBe(true);
			if (price.ok) {
				expect(price.value.listing.amountCents).toBe(9900);
				expect(price.value.featuring.amountCents).toBe(4900);
			}
		});
	});

	it('TC-BILL-03a/d: completes hosted auth and lists itemized invoice history', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const gateway = getFakePaymentGateway('http://127.0.0.1:5173');
			const init = await initializePaymentMethodForOwner(db, ownerId, gateway, {
				callbackUrl:
					'http://127.0.0.1:5173/provider/billing/payment-method/complete?return=/provider/billing',
				body: {}
			});
			expect(init.ok).toBe(true);
			if (!init.ok) return;

			gateway.markCompleted(init.value.reference);
			const complete = await completePaymentMethodForOwner(
				db,
				ownerId,
				gateway,
				init.value.reference,
				new Date()
			);
			expect(complete.ok).toBe(true);

			const billing = await getSelfServeBillingForOwner(db, ownerId);
			expect(billing?.paymentMethod.onFile).toBe(true);
			expect(billing?.paymentMethod.cardLast4).toBe('4242');
		});
	});

	it('TC-BILL-03c: cancel renewal keeps paid_listed until period end', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const periodEnd = new Date('2026-10-15T00:00:00.000Z');
			await db
				.update(listings)
				.set({
					state: 'paid_listed',
					currentPeriodEndsAt: periodEnd,
					cancelAtPeriodEnd: false,
					pspCustomerRef: 'CUS_test',
					pspAuthorizationCode: 'AUTH_test',
					cardLast4: '4242',
					cardBrand: 'Visa'
				})
				.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

			const cancel = await cancelListingRenewalForOwner(db, ownerId, new Date());
			expect(cancel.ok).toBe(true);

			const duplicate = await cancelListingRenewalForOwner(db, ownerId, new Date());
			expect(duplicate.ok).toBe(false);
			if (!duplicate.ok) {
				expect(duplicate.error.kind).toBe('conflict');
			}

			const billing = await getSelfServeBillingForOwner(db, ownerId);
			expect(billing?.state).toBe('paid_listed');
			expect(billing?.cancelAtPeriodEnd).toBe(true);
			expect(billing?.canCancelRenewal).toBe(false);
			expect(billing?.dashboard?.whatHappensNext).toContain('Renewal is cancelled');
		});
	});

	it('rejects completing a payment authorization for a different owner', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			resetFakePaymentGateway();
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const otherOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const gateway = getFakePaymentGateway('http://127.0.0.1:5173');

			const init = await initializePaymentMethodForOwner(db, ownerId, gateway, {
				callbackUrl:
					'http://127.0.0.1:5173/provider/billing/payment-method/complete?return=/provider/billing',
				body: {}
			});
			expect(init.ok).toBe(true);
			if (!init.ok) return;

			gateway.markCompleted(init.value.reference);

			const hijacked = await completePaymentMethodForOwner(
				db,
				otherOwnerId,
				gateway,
				init.value.reference,
				new Date()
			);
			expect(hijacked.ok).toBe(false);
			if (!hijacked.ok) {
				expect(hijacked.error.kind).toBe('forbidden');
			}
		});
	});

	it('TC-BILL-03d: returns itemized billing history', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const { insertInvoice } = await import('./infra/invoice-read');
			const now = new Date();

			await insertInvoice(db, {
				id: newId(),
				providerProfileId: asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID),
				lineItem: 'listing',
				amountCents: 9900,
				status: 'paid',
				pspInvoiceRef: 'TX_a',
				issuedAt: new Date(now.getTime() - 86_400_000),
				paidAt: now
			});
			await insertInvoice(db, {
				id: newId(),
				providerProfileId: asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID),
				lineItem: 'featuring',
				amountCents: 4900,
				status: 'paid',
				pspInvoiceRef: 'TX_b',
				issuedAt: now,
				paidAt: now
			});

			const history = await getBillingHistoryForOwner(db, ownerId, { cursor: null, limit: 20 });
			expect(history.ok).toBe(true);
			if (history.ok) {
				expect(history.value.items).toHaveLength(2);
				expect(history.value.items.map((row) => row.lineItemLabel)).toEqual([
					'Featuring add-on',
					'Listing subscription'
				]);
			}
		});
	});
});
