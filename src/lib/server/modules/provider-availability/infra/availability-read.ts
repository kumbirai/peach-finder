import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { availabilityStatus } from './schema';

export type AvailabilityProjectionMirror = {
	state: 'available' | 'not_available';
	setAt: Date | null;
};

export async function getAvailabilityProjectionMirror(
	db: Database | Transaction,
	providerProfileId: ProviderProfileId
): Promise<AvailabilityProjectionMirror> {
	const rows = await db
		.select({
			state: availabilityStatus.state,
			setAt: availabilityStatus.setAt
		})
		.from(availabilityStatus)
		.where(eq(availabilityStatus.providerProfileId, providerProfileId))
		.limit(1);
	const row = rows[0];
	const live = row?.state === 'available' || row?.state === 'expiry_warned';
	return {
		state: live ? 'available' : 'not_available',
		setAt: live ? (row?.setAt ?? null) : null
	};
}
