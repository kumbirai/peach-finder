import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { users } from '../infra/schema';

export type DisplayIdentity = {
	displayName: string;
	isDeleted: boolean;
};

export async function getDisplayIdentity(db: Database, userId: UserId): Promise<DisplayIdentity> {
	const rows = await db
		.select({
			displayName: users.displayName,
			status: users.status,
			anonymizedAt: users.anonymizedAt
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const row = rows[0];
	if (!row) {
		return { displayName: 'Deleted user', isDeleted: true };
	}
	const isDeleted = row.status === 'deleted' || row.anonymizedAt !== null;
	return {
		displayName: isDeleted ? 'Deleted user' : row.displayName,
		isDeleted
	};
}

export async function getContactPhone(db: Database, userId: UserId): Promise<string | null> {
	const rows = await db
		.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const row = rows[0];
	if (!row?.phone || !row.phoneVerifiedAt) return null;
	return row.phone;
}
