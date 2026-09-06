import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { getConfig } from '../../platform-configuration';
import type { PaymentGateway } from './ports';
import { getListingBillingRow } from '../infra/listing-billing-write';
import { getActiveFeaturing } from '../infra/featuring-read';
import { isFeaturableListingState } from '../domain/featuring-state';
import { processFeaturingPaymentWebhook } from '../infra/featuring-webhook';

export async function purchaseFeaturingForOwner(
	db: Database,
	ownerId: UserId,
	gateway: PaymentGateway,
	correlationId: string,
	now: Date
): Promise<Result<{ reference: string }, UseCaseError>> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const row = await getListingBillingRow(db, profileId);
	if (!row) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	if (!isFeaturableListingState(row.state)) {
		return Err({
			kind: 'precondition_failed',
			reason: 'Featuring requires an active listing.'
		});
	}

	const activeFeaturing = await getActiveFeaturing(db, profileId);
	if (activeFeaturing) {
		return Err({ kind: 'conflict', reason: 'Featuring is already active on your listing.' });
	}

	if (!row.pspAuthorizationCode || !row.pspCustomerRef) {
		return Err({
			kind: 'precondition_failed',
			reason: 'PAYMENT_METHOD_REQUIRED'
		});
	}

	const amountCents = getConfig('listing-billing.featuring_price_cents');
	const charge = await gateway.chargeAuthorization({
		authorizationCode: row.pspAuthorizationCode,
		customerCode: row.pspCustomerRef,
		amountCents,
		metadata: { providerProfileId: profileId, lineItem: 'featuring' }
	});

	if (!charge.ok) return charge;

	return Ok({ reference: charge.value.reference });
}

export async function completeFeaturingPurchaseForOwner(
	db: Database,
	ownerId: UserId,
	reference: string,
	correlationId: string,
	now: Date,
	eventId: string
): Promise<Result<{ activated: boolean }, UseCaseError>> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const result = await processFeaturingPaymentWebhook(db, {
		providerProfileId: profileId,
		reference,
		eventId,
		correlationId,
		now,
		kind: 'purchase'
	});

	if (result.status === 'duplicate') {
		return Ok({ activated: true });
	}
	if (result.status === 'ignored') {
		return Err({ kind: 'precondition_failed', reason: 'Featuring purchase could not be applied.' });
	}

	return Ok({ activated: true });
}

export async function cancelFeaturingRenewalForOwner(
	db: Database,
	ownerId: UserId,
	now: Date
): Promise<Result<{ currentPeriodEndsAt: string }, UseCaseError>> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const featuring = await getActiveFeaturing(db, profileId);
	if (!featuring?.currentPeriodEndsAt) {
		return Err({
			kind: 'precondition_failed',
			reason: 'Featuring cancel renewal is available only while featuring is active.'
		});
	}

	if (featuring.cancelAtPeriodEnd) {
		return Err({
			kind: 'conflict',
			reason: 'Featuring renewal is already set to cancel at period end.'
		});
	}

	const { cancelFeaturingRenewal } = await import('../infra/featuring-read');
	const updated = await cancelFeaturingRenewal(db, profileId, now);
	if (!updated) {
		return Err({ kind: 'not_found', resource: 'featuring' });
	}

	return Ok({ currentPeriodEndsAt: featuring.currentPeriodEndsAt });
}
