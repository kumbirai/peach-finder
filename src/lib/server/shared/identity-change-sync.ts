import type { Database } from '../db';
import {
	refreshSearchDisplayName,
	updateSearchBadgeFlag
} from '../modules/discovery-search/infra/projection-handlers';
import { getOwnedProfileIdDb } from '../modules/provider-profile';
import {
	handleIdentityAttributesChanged,
	loadBadgeDisplayState
} from '../modules/trust-and-safety';
import type { DomainEvent } from './events';
import { asId } from './ids';

export async function applyIdentityAttributesChangedSync(
	db: Database,
	event: DomainEvent<'IdentityAttributesChanged', { userId: string; changedFields: string[] }>,
	now: Date
): Promise<void> {
	await handleIdentityAttributesChanged(db, event);
	await db.transaction(async (tx) => {
		await refreshSearchDisplayName(tx, event.payload.userId, now);
		const profileId = await getOwnedProfileIdDb(tx, asId<'UserId'>(event.payload.userId));
		if (!profileId) return;
		const badge = await loadBadgeDisplayState(tx, profileId);
		await updateSearchBadgeFlag(tx, profileId, 'identity_verified', badge.identityVerified, now);
	});
}
