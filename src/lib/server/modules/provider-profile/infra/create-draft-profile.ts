import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { newId, type AreaId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { Ok, type Result, type UseCaseError } from '../../../shared/result';
import { providerProfiles } from './schema';

export async function createDraftProfile(
	db: Database,
	ownerId: UserId,
	areaId?: AreaId
): Promise<Result<{ profileId: ProviderProfileId; created: boolean }, UseCaseError>> {
	const existing = await db
		.select({ id: providerProfiles.id })
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, ownerId))
		.limit(1);

	if (existing[0]) {
		return Ok({
			profileId: existing[0].id as ProviderProfileId,
			created: false
		});
	}

	const profileId = newId<'ProviderProfileId'>();
	await db.insert(providerProfiles).values({
		id: profileId,
		ownerId,
		areaId: areaId ?? null,
		publishState: 'draft'
	});

	return Ok({ profileId, created: true });
}
