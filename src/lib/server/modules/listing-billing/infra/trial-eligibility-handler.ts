import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { primePhoneHistoryRef } from './phone-history-read';
import { listings } from './schema';

export async function handlePhoneVerifiedForTrialEligibility(
	tx: Transaction,
	userId: UserId,
	phoneHash: string,
	now: Date
): Promise<void> {
	const profileId = await getOwnedProfileIdDb(tx, userId);
	if (!profileId) return;
	await primePhoneHistoryRef(tx, profileId, phoneHash, now);
}

export async function recordPhoneHistoryRefForOwner(
	tx: Transaction,
	ownerId: UserId,
	phoneHash: string,
	now: Date
): Promise<void> {
	const profileId = await getOwnedProfileIdDb(tx, ownerId);
	if (!profileId) return;

	await tx
		.update(listings)
		.set({ phoneHistoryRef: phoneHash, updatedAt: now })
		.where(eq(listings.providerProfileId, profileId));
}
