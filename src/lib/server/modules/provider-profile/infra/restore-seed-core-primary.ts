import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { runSearchProjectionReconcile } from '../../discovery-search';
import { asId, type UserId } from '../../../shared/ids';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../../scripts/seed-core';
import { publishProfileForOwner } from './publish-profile';
import { providerProfiles } from './schema';

export type RestoreSeedCorePrimaryResult = {
	profileId: string;
	wasPublished: boolean;
	republished: boolean;
	reconcile: Awaited<ReturnType<typeof runSearchProjectionReconcile>>;
};

export async function restoreSeedCorePrimaryListing(
	db: Database,
	now: Date,
	correlationId: string
): Promise<RestoreSeedCorePrimaryResult> {
	const rows = await db
		.select({
			ownerId: providerProfiles.ownerId,
			publishState: providerProfiles.publishState
		})
		.from(providerProfiles)
		.where(eq(providerProfiles.id, SEED_CORE_PRIMARY_PROFILE_ID))
		.limit(1);

	const row = rows[0];
	if (!row) {
		throw new Error(`seed-core primary profile ${SEED_CORE_PRIMARY_PROFILE_ID} is missing`);
	}

	const wasPublished = row.publishState === 'published';
	let republished = false;

	if (!wasPublished) {
		const published = await publishProfileForOwner(
			db,
			asId<'UserId'>(row.ownerId),
			correlationId,
			now
		);
		if (!published.ok) {
			throw new Error(`could not republish seed-core primary listing: ${published.error.kind}`);
		}
		republished = !published.value.alreadyPublished;
	}

	const reconcile = await runSearchProjectionReconcile(db, now);

	return {
		profileId: SEED_CORE_PRIMARY_PROFILE_ID,
		wasPublished,
		republished,
		reconcile
	};
}
