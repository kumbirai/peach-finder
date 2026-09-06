import type { UserId } from '../../../shared/ids';
import { listTermsAcceptanceForUser } from './terms-acceptance';

export async function exportFor(userId: UserId) {
	const { getDb } = await import('../../../db');
	const db = getDb();
	const termsAcceptance = await listTermsAcceptanceForUser(db, userId);
	return { termsAcceptance };
}
