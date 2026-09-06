import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { toProviderInvoiceView } from '../domain/invoice';
import { listInvoicesForProfile } from '../infra/invoice-read';

export async function getBillingHistoryForOwner(
	db: Database,
	ownerId: UserId,
	input: { cursor: string | null; limit: number }
): Promise<
	Result<
		{ items: ReturnType<typeof toProviderInvoiceView>[]; nextCursor: string | null },
		UseCaseError
	>
> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'listing' });
	}

	const page = await listInvoicesForProfile(db, profileId, input);

	return Ok({
		items: page.items.map((row) =>
			toProviderInvoiceView({
				id: row.id,
				lineItem: row.lineItem,
				amountCents: row.amountCents,
				currency: row.currency,
				status: row.status,
				issuedAt: row.issuedAt,
				paidAt: row.paidAt,
				pspInvoiceRef: row.pspInvoiceRef
			})
		),
		nextCursor: page.nextCursor
	});
}
