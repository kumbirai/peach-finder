import { and, eq, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { newId, type PhotoId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { getPhotoOwner, getPhotoUploadStatus, removeMediaPhoto } from '../../media-processing';
import { providerPhotos, providerProfiles } from './schema';

const MAX_GALLERY_PHOTOS = 12;

async function requireOwnedProfile(
	db: Database | Transaction,
	userId: UserId
): Promise<Result<{ profileId: ProviderProfileId }, UseCaseError>> {
	const rows = await db
		.select({ id: providerProfiles.id })
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, userId))
		.limit(1);
	const row = rows[0];
	if (!row) return Err({ kind: 'not_found', resource: 'provider_profile' });
	return Ok({ profileId: row.id as ProviderProfileId });
}

async function emitPhotoAdded(
	tx: Transaction,
	profileId: ProviderProfileId,
	photoId: PhotoId,
	correlationId: string,
	now: Date
): Promise<void> {
	const event: DomainEvent<'PhotoAdded', { providerProfileId: string; photoId: string }> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'PhotoAdded',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: { providerProfileId: profileId, photoId }
	};
	await publish(tx, event);
}

async function emitProfileUpdated(
	tx: Transaction,
	profileId: ProviderProfileId,
	correlationId: string,
	now: Date
): Promise<void> {
	const event: DomainEvent<
		'ProfileUpdated',
		{ providerProfileId: string; changedFields: string[] }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'ProfileUpdated',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: { providerProfileId: profileId, changedFields: ['photos'] }
	};
	await publish(tx, event);
}

export async function attachProfilePhoto(
	db: Database,
	userId: UserId,
	photoId: PhotoId,
	correlationId: string,
	now: Date
): Promise<Result<{ providerPhotoId: string }, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const owner = await getPhotoOwner(db, photoId);
	if (!owner) return Err({ kind: 'not_found', resource: 'photo' });
	if (owner !== userId) return Err({ kind: 'forbidden', reason: 'photo_owner_mismatch' });

	const mediaStatus = await getPhotoUploadStatus(db, photoId, userId);
	if (!mediaStatus) return Err({ kind: 'not_found', resource: 'photo' });
	if (mediaStatus.status === 'failed') {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'photoId', message: mediaStatus.failedReason ?? 'Photo processing failed.' }]
		});
	}

	const providerPhotoId = newId();

	return db.transaction(async (tx) => {
		await tx.execute(sql`
			select id from provider_profile.provider_profile
			where id = ${owned.value.profileId}::uuid
			for update
		`);

		const countRows = await tx.execute<{ count: number }>(sql`
			select count(*)::int as count
			from provider_profile.provider_photo
			where provider_profile_id = ${owned.value.profileId}::uuid
		`);
		const total = (countRows as unknown as { count: number }[])[0]?.count ?? 0;
		if (total >= MAX_GALLERY_PHOTOS) {
			return Err({ kind: 'conflict', reason: 'You already have the maximum number of photos.' });
		}

		const existing = await tx
			.select({ id: providerPhotos.id })
			.from(providerPhotos)
			.where(
				and(
					eq(providerPhotos.providerProfileId, owned.value.profileId),
					eq(providerPhotos.photoId, photoId)
				)
			)
			.limit(1);
		if (existing[0]) {
			return Ok({ providerPhotoId: existing[0].id });
		}

		const isFirst = total === 0;
		const galleryStatus = mediaStatus.status === 'ready' ? 'ready' : 'pending';

		await tx.insert(providerPhotos).values({
			id: providerPhotoId,
			providerProfileId: owned.value.profileId,
			photoId,
			status: galleryStatus,
			sortOrder: total,
			isPrimary: isFirst
		});

		if (galleryStatus === 'ready') {
			await emitPhotoAdded(tx, owned.value.profileId, photoId, correlationId, now);
		}

		return Ok({ providerPhotoId });
	});
}

export async function reorderProfilePhotos(
	db: Database,
	userId: UserId,
	photoIds: PhotoId[],
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const rows = await db
		.select({ photoId: providerPhotos.photoId })
		.from(providerPhotos)
		.where(eq(providerPhotos.providerProfileId, owned.value.profileId));

	const existingIds = rows.map((r) => r.photoId);
	if (photoIds.length !== existingIds.length) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'order', message: 'Photo order must include every gallery photo.' }]
		});
	}
	for (const id of photoIds) {
		if (!existingIds.includes(id)) {
			return Err({
				kind: 'validation_failed',
				issues: [{ path: 'order', message: 'Unknown photo in order list.' }]
			});
		}
	}

	await db.transaction(async (tx) => {
		for (let i = 0; i < photoIds.length; i++) {
			await tx
				.update(providerPhotos)
				.set({ sortOrder: i })
				.where(
					and(
						eq(providerPhotos.providerProfileId, owned.value.profileId),
						eq(providerPhotos.photoId, photoIds[i]!)
					)
				);
		}
		await emitProfileUpdated(tx, owned.value.profileId, correlationId, now);
	});

	return Ok(undefined);
}

export async function setPrimaryProfilePhoto(
	db: Database,
	userId: UserId,
	photoId: PhotoId,
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const target = await db
		.select({ id: providerPhotos.id })
		.from(providerPhotos)
		.where(
			and(
				eq(providerPhotos.providerProfileId, owned.value.profileId),
				eq(providerPhotos.photoId, photoId),
				eq(providerPhotos.status, 'ready')
			)
		)
		.limit(1);
	if (!target[0]) return Err({ kind: 'not_found', resource: 'photo' });

	await db.transaction(async (tx) => {
		await tx
			.update(providerPhotos)
			.set({ isPrimary: false })
			.where(eq(providerPhotos.providerProfileId, owned.value.profileId));
		await tx
			.update(providerPhotos)
			.set({ isPrimary: true })
			.where(eq(providerPhotos.id, target[0]!.id));
		await emitProfileUpdated(tx, owned.value.profileId, correlationId, now);
	});

	return Ok(undefined);
}

export async function deleteProfilePhoto(
	db: Database,
	userId: UserId,
	photoId: PhotoId,
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const row = await db
		.select({
			id: providerPhotos.id,
			isPrimary: providerPhotos.isPrimary,
			sortOrder: providerPhotos.sortOrder
		})
		.from(providerPhotos)
		.where(
			and(
				eq(providerPhotos.providerProfileId, owned.value.profileId),
				eq(providerPhotos.photoId, photoId)
			)
		)
		.limit(1);
	if (!row[0]) return Err({ kind: 'not_found', resource: 'photo' });

	await db.transaction(async (tx) => {
		await tx.delete(providerPhotos).where(eq(providerPhotos.id, row[0]!.id));

		if (row[0]!.isPrimary) {
			const next = await tx
				.select({ id: providerPhotos.id })
				.from(providerPhotos)
				.where(eq(providerPhotos.providerProfileId, owned.value.profileId))
				.orderBy(providerPhotos.sortOrder)
				.limit(1);
			if (next[0]) {
				await tx
					.update(providerPhotos)
					.set({ isPrimary: true })
					.where(eq(providerPhotos.id, next[0].id));
			}
		}

		const event: DomainEvent<'PhotoRemoved', { providerProfileId: string; photoId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'PhotoRemoved',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: { providerProfileId: owned.value.profileId, photoId }
		};
		await publish(tx, event);
	});

	return removeMediaPhoto(db, photoId, correlationId);
}

export async function finalizePhotoFromMediaProcessed(
	db: Database | Transaction,
	photoId: PhotoId,
	correlationId: string,
	now: Date
): Promise<void> {
	const pendingRows = await db
		.select({
			id: providerPhotos.id,
			providerProfileId: providerPhotos.providerProfileId,
			status: providerPhotos.status
		})
		.from(providerPhotos)
		.where(and(eq(providerPhotos.photoId, photoId), eq(providerPhotos.status, 'pending')));

	for (const row of pendingRows) {
		await db.transaction(async (tx) => {
			await tx.update(providerPhotos).set({ status: 'ready' }).where(eq(providerPhotos.id, row.id));
			await emitPhotoAdded(
				tx,
				row.providerProfileId as ProviderProfileId,
				photoId,
				correlationId,
				now
			);
		});
	}
}

export async function prunePhotoFromMediaRemoved(
	db: Database | Transaction,
	photoId: PhotoId
): Promise<void> {
	await db.delete(providerPhotos).where(eq(providerPhotos.photoId, photoId));
}
