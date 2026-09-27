import { eq } from 'drizzle-orm';
import type { UserId } from '../../../shared/ids';
import { users } from './schema';
import { listTermsAcceptanceForUser } from './terms-acceptance';

export async function exportFor(userId: UserId) {
	const { getDb } = await import('../../../db');
	const db = getDb();
	const accountRows = await db
		.select({
			displayName: users.displayName,
			email: users.email,
			phone: users.phone,
			status: users.status,
			createdAt: users.createdAt,
			emailVerifiedAt: users.emailVerifiedAt,
			phoneVerifiedAt: users.phoneVerifiedAt
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const termsAcceptance = await listTermsAcceptanceForUser(db, userId);
	return {
		account: accountRows[0] ?? null,
		termsAcceptance
	};
}
