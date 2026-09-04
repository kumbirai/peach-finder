import type { Database, Transaction } from '../../db';
import type { UserId } from '../../shared/ids';
import { getOwnedProfileIdDb } from '../provider-profile';
import { cancelListingForProfile } from './infra/cancel-on-delete';

export async function cancelListingForOwner(
	tx: Transaction,
	ownerId: UserId,
	now: Date
): Promise<void> {
	const profileId = await getOwnedProfileIdDb(tx as Database, ownerId);
	if (!profileId) return;
	await cancelListingForProfile(tx, profileId, now);
}

/** Wave 0 stub — populated by later waves. */
export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
