import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { upsertSearchProjection } from '../../discovery-search/index';
import { ensureBuildingListing, startTrialOnPublish } from '../../listing-billing/index';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { computePublishReadiness, type MissingField } from '../domain/publish-readiness';
import { MISSING_FIELD_LABELS } from '../domain/missing-field-labels';
import { providerLanguages, providerProfiles, services } from './schema';

export async function publishProfileForOwner(
	db: Database,
	userId: UserId,
	correlationId: string,
	now: Date
): Promise<Result<{ profileId: ProviderProfileId; alreadyPublished: boolean }, UseCaseError>> {
	const rows = await db
		.select({
			id: providerProfiles.id,
			publishState: providerProfiles.publishState,
			areaId: providerProfiles.areaId,
			intro: providerProfiles.intro,
			firstPublishedAt: providerProfiles.firstPublishedAt
		})
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, userId))
		.limit(1);

	const profile = rows[0];
	if (!profile) return Err({ kind: 'not_found', resource: 'provider_profile' });

	const profileId = profile.id as ProviderProfileId;

	if (profile.publishState === 'published') {
		return Ok({ profileId, alreadyPublished: true });
	}

	const readiness = await loadReadiness(db, profileId, profile.intro, profile.areaId != null);
	if (!readiness.ready) {
		return Err({
			kind: 'validation_failed',
			issues: readiness.missing.map((field) => ({
				path: field,
				message: MISSING_FIELD_LABELS[field as MissingField]
			}))
		});
	}

	if (!profile.areaId) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'area', message: MISSING_FIELD_LABELS.area }]
		});
	}

	let alreadyPublished = false;

	await db.transaction(async (tx) => {
		const lockedRows = await tx.execute<{
			publish_state: string;
			first_published_at: Date | null;
			area_id: string | null;
		}>(sql`
			select publish_state, first_published_at, area_id
			from provider_profile.provider_profile
			where id = ${profileId}::uuid
			for update
		`);
		const locked = (
			lockedRows as unknown as Array<{
				publish_state: string;
				first_published_at: Date | null;
				area_id: string | null;
			}>
		)[0];
		if (!locked?.area_id) {
			return;
		}
		if (locked.publish_state === 'published') {
			alreadyPublished = true;
			return;
		}

		const publishFirstAt = locked.first_published_at ? new Date(locked.first_published_at) : now;

		const updated = await tx
			.update(providerProfiles)
			.set({
				publishState: 'published',
				unpublishReason: null,
				firstPublishedAt: publishFirstAt,
				updatedAt: now
			})
			.where(
				and(
					eq(providerProfiles.id, profileId),
					inArray(providerProfiles.publishState, ['draft', 'unpublished'])
				)
			)
			.returning({ id: providerProfiles.id });

		if (updated.length === 0) {
			return;
		}

		await ensureBuildingListing(tx, profileId, now);
		await startTrialOnPublish(tx, profileId, userId, correlationId, now);
		await upsertSearchProjection(tx, profileId, publishFirstAt);

		const event: DomainEvent<
			'ProviderPublished',
			{ providerProfileId: string; ownerId: string; areaId: string }
		> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'ProviderPublished',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: {
				providerProfileId: profileId,
				ownerId: userId,
				areaId: locked.area_id
			}
		};
		await publish(tx, event);
	});

	return Ok({ profileId, alreadyPublished });
}

async function loadReadiness(
	db: Database,
	profileId: ProviderProfileId,
	intro: string | null,
	hasArea: boolean
): Promise<{ ready: true } | { ready: false; missing: string[] }> {
	const photoRows = await db.execute<{ count: number }>(sql`
		select count(*)::int as count
		from provider_profile.provider_photo
		where provider_profile_id = ${profileId}::uuid
		  and status = 'ready'
	`);
	const serviceRows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(services)
		.where(eq(services.providerProfileId, profileId));
	const languageRows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(providerLanguages)
		.where(eq(providerLanguages.providerProfileId, profileId));

	return computePublishReadiness({
		readyPhotoCount: (photoRows as unknown as Array<{ count: number }>)[0]?.count ?? 0,
		intro,
		pricedServiceCount: serviceRows[0]?.count ?? 0,
		languageCount: languageRows[0]?.count ?? 0,
		hasArea
	});
}
