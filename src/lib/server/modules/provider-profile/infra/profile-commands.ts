import { and, eq, inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { Database, Transaction } from '../../../db';
import { uploadProfilePhoto } from '../../media-processing';
import {
	newId,
	type AreaId,
	type PhotoId,
	type ProviderProfileId,
	type UserId
} from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { validateIntro } from '../domain/intro-policy';
import { validateServiceInput, type ServiceInput } from '../domain/service-policy';
import {
	languages,
	providerLanguages,
	providerProfiles,
	providerServiceTags,
	services,
	serviceTags
} from './schema';
import { attachProfilePhoto } from './photo-commands';
import { getGalleryReadyCount } from './gallery-count';
import { refreshSearchProjectionIfPublished } from './refresh-projection';

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

async function emitProfileUpdated(
	tx: Transaction,
	profileId: ProviderProfileId,
	changedFields: string[],
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
		payload: { providerProfileId: profileId, changedFields }
	};
	await publish(tx, event);
}

export async function updateIntro(
	db: Database,
	userId: UserId,
	intro: string,
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const issues = validateIntro(intro);
	if (issues.length > 0) return Err({ kind: 'validation_failed', issues });

	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const trimmed = intro.trim();
	await db.transaction(async (tx) => {
		await tx
			.update(providerProfiles)
			.set({ intro: trimmed, updatedAt: now })
			.where(eq(providerProfiles.id, owned.value.profileId));
		await emitProfileUpdated(tx, owned.value.profileId, ['intro'], correlationId, now);
		await refreshSearchProjectionIfPublished(tx, owned.value.profileId, now);
	});

	return Ok(undefined);
}

export async function updateArea(
	db: Database,
	userId: UserId,
	areaId: AreaId,
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const areaRows = await db.execute<{ id: string }>(sql`
		select id from platform_configuration.area
		where id = ${areaId}::uuid and is_active = true
		limit 1
	`);
	if (!areaRows[0]) {
		return Err({ kind: 'not_found', resource: 'area' });
	}

	await db.transaction(async (tx) => {
		await tx
			.update(providerProfiles)
			.set({ areaId, updatedAt: now })
			.where(eq(providerProfiles.id, owned.value.profileId));
		await emitProfileUpdated(tx, owned.value.profileId, ['area'], correlationId, now);
		await refreshSearchProjectionIfPublished(tx, owned.value.profileId, now);
	});

	return Ok(undefined);
}

export async function addService(
	db: Database,
	userId: UserId,
	input: ServiceInput,
	correlationId: string,
	now: Date
): Promise<Result<{ serviceId: string }, UseCaseError>> {
	const issues = validateServiceInput(input);
	if (issues.length > 0) return Err({ kind: 'validation_failed', issues });

	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const serviceId = newId<'ServiceId'>();
	await db.transaction(async (tx) => {
		const existing = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(services)
			.where(eq(services.providerProfileId, owned.value.profileId));
		const sortOrder = existing[0]?.count ?? 0;

		await tx.insert(services).values({
			id: serviceId,
			providerProfileId: owned.value.profileId,
			name: input.name.trim(),
			description: input.description?.trim() || null,
			durationMinutes: input.durationMinutes,
			priceCents: input.priceCents,
			sortOrder
		});
		await emitProfileUpdated(tx, owned.value.profileId, ['services'], correlationId, now);
		await refreshSearchProjectionIfPublished(tx, owned.value.profileId, now);
	});

	return Ok({ serviceId });
}

export async function setLanguages(
	db: Database,
	userId: UserId,
	codes: string[],
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
	if (uniqueCodes.length === 0) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'codes', message: 'Select at least one language.' }]
		});
	}

	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const activeRows = await db
		.select({ code: languages.code })
		.from(languages)
		.where(and(inArray(languages.code, uniqueCodes), eq(languages.isActive, true)));

	if (activeRows.length !== uniqueCodes.length) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'codes', message: 'One or more languages are not available.' }]
		});
	}

	await db.transaction(async (tx) => {
		await tx
			.delete(providerLanguages)
			.where(eq(providerLanguages.providerProfileId, owned.value.profileId));
		for (const code of uniqueCodes) {
			await tx.insert(providerLanguages).values({
				providerProfileId: owned.value.profileId,
				languageCode: code
			});
		}
		await emitProfileUpdated(tx, owned.value.profileId, ['languages'], correlationId, now);
		await refreshSearchProjectionIfPublished(tx, owned.value.profileId, now);
	});

	return Ok(undefined);
}

export async function setServiceTags(
	db: Database,
	userId: UserId,
	tagIds: string[],
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	if (tagIds.length > 0) {
		const activeRows = await db
			.select({ id: serviceTags.id })
			.from(serviceTags)
			.where(and(inArray(serviceTags.id, tagIds), eq(serviceTags.isActive, true)));
		if (activeRows.length !== tagIds.length) {
			return Err({ kind: 'not_found', resource: 'service_tag' });
		}
	}

	await db.transaction(async (tx) => {
		await tx
			.delete(providerServiceTags)
			.where(eq(providerServiceTags.providerProfileId, owned.value.profileId));
		for (const tagId of tagIds) {
			await tx.insert(providerServiceTags).values({
				providerProfileId: owned.value.profileId,
				serviceTagId: tagId
			});
		}
		await emitProfileUpdated(tx, owned.value.profileId, ['tags'], correlationId, now);
		await refreshSearchProjectionIfPublished(tx, owned.value.profileId, now);
	});

	return Ok(undefined);
}

export async function attachOnboardingPhoto(
	db: Database,
	userId: UserId,
	correlationId: string,
	now: Date
): Promise<Result<{ photoId: string }, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const readyCount = await getGalleryReadyCount(db, userId);
	if (readyCount >= MAX_GALLERY_PHOTOS) {
		return Err({ kind: 'conflict', reason: 'You already have the maximum number of photos.' });
	}

	const bytes = await sharp({
		create: {
			width: 64,
			height: 64,
			channels: 3,
			background: {
				r: Math.floor(Math.random() * 200) + 20,
				g: Math.floor(Math.random() * 200) + 20,
				b: Math.floor(Math.random() * 200) + 20
			}
		}
	})
		.jpeg()
		.toBuffer();

	const uploaded = await uploadProfilePhoto(
		db,
		userId,
		bytes,
		'profile_photo',
		readyCount,
		correlationId,
		now
	);
	if (!uploaded.ok) return uploaded;

	const attached = await attachProfilePhoto(
		db,
		userId,
		uploaded.value.photoId as PhotoId,
		correlationId,
		now
	);
	if (!attached.ok) return attached;

	return Ok({ photoId: uploaded.value.photoId });
}

export async function updatePhoneVisibility(
	db: Database,
	userId: UserId,
	visible: boolean,
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	await db.transaction(async (tx) => {
		await tx
			.update(providerProfiles)
			.set({ phoneVisible: visible, updatedAt: now })
			.where(eq(providerProfiles.id, owned.value.profileId));
		await emitProfileUpdated(tx, owned.value.profileId, ['phone_visible'], correlationId, now);
	});

	return Ok(undefined);
}

export async function listActiveLanguages(db: Database) {
	return db
		.select({ code: languages.code, name: languages.name })
		.from(languages)
		.where(eq(languages.isActive, true))
		.orderBy(languages.sortOrder);
}

export async function listActiveServiceTags(db: Database) {
	return db
		.select({ id: serviceTags.id, name: serviceTags.name, slug: serviceTags.slug })
		.from(serviceTags)
		.where(eq(serviceTags.isActive, true))
		.orderBy(serviceTags.name);
}
