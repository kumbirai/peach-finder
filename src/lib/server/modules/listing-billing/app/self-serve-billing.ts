import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getAccountSummary } from '../../identity-and-access';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { getConfig } from '../../platform-configuration';
import { assertNoCardDataInBody } from '../domain/payment-method';
import type { PaymentGateway } from './ports';
import {
	cancelListingRenewal,
	getListingBillingRow,
	savePaymentMethod
} from '../infra/listing-billing-write';

export type InitializePaymentMethodResult = {
	authorizationUrl: string;
	reference: string;
};

export async function initializePaymentMethodForOwner(
	db: Database,
	ownerId: UserId,
	gateway: PaymentGateway,
	input: {
		callbackUrl: string;
		body: Record<string, unknown>;
	}
): Promise<Result<InitializePaymentMethodResult, UseCaseError>> {
	const cardError = assertNoCardDataInBody(input.body);
	if (cardError) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'paymentMethod', message: cardError }]
		});
	}

	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const account = await getAccountSummary(db, ownerId);
	if (!account?.email) {
		return Err({
			kind: 'precondition_failed',
			reason: 'Add a verified email before saving a payment method.'
		});
	}

	const session = await gateway.initializeAuthorization({
		email: account.email,
		callbackUrl: input.callbackUrl,
		metadata: { providerProfileId: profileId, ownerId }
	});

	if (!session.ok) return session;

	return Ok(session.value);
}

export async function completePaymentMethodForOwner(
	db: Database,
	ownerId: UserId,
	gateway: PaymentGateway,
	reference: string,
	now: Date
): Promise<Result<{ cardLast4: string; cardBrand: string }, UseCaseError>> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const verified = await gateway.verifyAuthorization(reference, {
		ownerId,
		providerProfileId: profileId
	});
	if (!verified.ok) return verified;

	await savePaymentMethod(db, profileId, {
		pspCustomerRef: verified.value.customerCode,
		pspAuthorizationCode: verified.value.authorizationCode,
		cardLast4: verified.value.cardLast4,
		cardBrand: verified.value.cardBrand,
		now
	});

	return Ok({
		cardLast4: verified.value.cardLast4,
		cardBrand: verified.value.cardBrand
	});
}

export type BillingPriceDto = {
	listing: { amountCents: number; currency: 'ZAR'; amountLabel: string };
	featuring: { amountCents: number; currency: 'ZAR'; amountLabel: string };
};

export async function getBillingPriceForOwner(
	db: Database,
	ownerId: UserId
): Promise<Result<BillingPriceDto, UseCaseError>> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const listingPriceCents = getConfig('listing-billing.listing_price_cents');
	const featuringPriceCents = getConfig('listing-billing.featuring_price_cents');
	const format = (cents: number) =>
		`R${Math.round(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	return Ok({
		listing: {
			amountCents: listingPriceCents,
			currency: 'ZAR',
			amountLabel: format(listingPriceCents)
		},
		featuring: {
			amountCents: featuringPriceCents,
			currency: 'ZAR',
			amountLabel: format(featuringPriceCents)
		}
	});
}

export async function cancelListingRenewalForOwner(
	db: Database,
	ownerId: UserId,
	now: Date
): Promise<Result<{ currentPeriodEndsAt: string }, UseCaseError>> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const row = await getListingBillingRow(db, profileId);
	if (!row) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	if (row.state !== 'paid_listed' || !row.currentPeriodEndsAt) {
		return Err({
			kind: 'precondition_failed',
			reason: 'Cancel renewal is available only while you have an active paid listing period.'
		});
	}

	if (row.cancelAtPeriodEnd) {
		return Err({ kind: 'conflict', reason: 'Renewal is already set to cancel at period end.' });
	}

	await cancelListingRenewal(db, profileId, now);

	return Ok({ currentPeriodEndsAt: row.currentPeriodEndsAt.toISOString() });
}
