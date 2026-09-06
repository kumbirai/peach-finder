import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { phoneRegistryHistory, users } from './schema';
import { hashPhone } from './phone-hash';

/** HMAC phone hash for the owner's OTP-verified number (FR-MONET-03). */
export async function getVerifiedPhoneHash(db: Database, ownerId: UserId): Promise<string | null> {
	const rows = await db
		.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
		.from(users)
		.where(eq(users.id, ownerId))
		.limit(1);
	const row = rows[0];
	if (!row?.phone || !row.phoneVerifiedAt) return null;
	return hashPhone(row.phone);
}

export async function getPhoneVerifiedAt(db: Database, ownerId: UserId): Promise<Date | null> {
	const rows = await db
		.select({ phoneVerifiedAt: users.phoneVerifiedAt })
		.from(users)
		.where(eq(users.id, ownerId))
		.limit(1);
	return rows[0]?.phoneVerifiedAt ?? null;
}

/**
 * True when this phone hash was registered on a prior account before the current verification.
 * The registry row is created on first OTP verify; a later account re-using the number leaves
 * `first_registered_at` at the original timestamp while `last_registered_at` advances.
 */
export async function wasPhoneUsedBefore(
	db: Database,
	phoneHash: string,
	currentVerifiedAt: Date
): Promise<boolean> {
	const rows = await db
		.select({
			firstRegisteredAt: phoneRegistryHistory.firstRegisteredAt,
			lastRegisteredAt: phoneRegistryHistory.lastRegisteredAt
		})
		.from(phoneRegistryHistory)
		.where(eq(phoneRegistryHistory.phoneHash, phoneHash))
		.limit(1);
	const row = rows[0];
	if (!row) return false;

	if (row.lastRegisteredAt.getTime() > row.firstRegisteredAt.getTime()) {
		return true;
	}

	return row.firstRegisteredAt.getTime() < currentVerifiedAt.getTime() - 1_000;
}
