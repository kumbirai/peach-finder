import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { getConfig } from '../../platform-configuration';
import type { PaymentGateway } from './ports';
import { getListingBillingRow } from '../infra/listing-billing-write';
import { resolvePaymentTransition } from '../domain/subscription-state';

export async function initiateListingPaymentForOwner(
	db: Database,
	ownerId: UserId,
	gateway: PaymentGateway,
	correlationId: string
): Promise<Result<{ reference: string }, UseCaseError>> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const row = await getListingBillingRow(db, profileId);
	if (!row) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const paymentKind = resolvePaymentTransition(row.state);
	if (!paymentKind) {
		return Err({
			kind: 'precondition_failed',
			reason: 'Listing payment is not due for your current billing state.'
		});
	}

	if (!row.pspAuthorizationCode || !row.pspCustomerRef) {
		return Err({
			kind: 'precondition_failed',
			reason: 'Add a payment method before paying for your listing.'
		});
	}

	const amountCents = getConfig('listing-billing.listing_price_cents');
	const charge = await gateway.chargeAuthorization({
		authorizationCode: row.pspAuthorizationCode,
		customerCode: row.pspCustomerRef,
		amountCents,
		metadata: { providerProfileId: profileId, lineItem: 'listing' }
	});

	if (!charge.ok) return charge;

	return Ok({ reference: charge.value.reference });
}
