import sanitizeHtml from 'sanitize-html';
import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../db';
import { areas, config, lexiconEntries } from './infra/schema';
import {
	CONFIG_DEFAULTS,
	CONFIG_KEYS,
	ConfigRegistry,
	isConfigKey,
	validateCrossKeys,
	type ConfigKey,
	type ConfigValue
} from './domain/config-registry';
import {
	getConfig,
	loadConfigCache,
	refreshConfigKey,
	maybeRefreshAll
} from './infra/config-cache';
import { newId, type AreaId, type LexiconEntryId, type UserId } from '../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../shared/result';
import { writeAudit } from '../../shared/audit';
import { publish } from '../../shared/outbox';
import { asInstant, type Clock } from '../../shared/clock';
import type { AuthContext } from '../../shared/auth-context';
import { parseMapsTo, LEXICON_ENTRY_TYPES, type LexiconEntryType } from '../discovery-search';
import { exportFor as identityExportFor } from '../identity-and-access';
import * as providerProfile from '../provider-profile';
import * as providerAvailability from '../provider-availability';
import * as directMessaging from '../direct-messaging';
import * as providerReviews from '../provider-reviews';
import * as trustAndSafety from '../trust-and-safety';
import * as listingBilling from '../listing-billing';
import * as userNotifications from '../user-notifications';
import * as mediaProcessing from '../media-processing';

export { getConfig, loadConfigCache, refreshConfigKey, maybeRefreshAll };
export { CONFIG_KEYS, CONFIG_DEFAULTS, isConfigKey, type ConfigKey };

const SAFETY_SANITIZE: sanitizeHtml.IOptions = {
	allowedTags: ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'br'],
	allowedAttributes: { a: ['href'] }
};

const ZA_AREAS: Array<{
	slug: string;
	name: string;
	lat: number;
	lng: number;
	parent?: string;
}> = [
	{ slug: 'johannesburg', name: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
	{ slug: 'sandton', name: 'Sandton', lat: -26.1076, lng: 28.0567, parent: 'johannesburg' },
	{ slug: 'rosebank', name: 'Rosebank', lat: -26.1448, lng: 28.0416, parent: 'johannesburg' },
	{ slug: 'pretoria', name: 'Pretoria', lat: -25.7479, lng: 28.2293 },
	{ slug: 'cape-town', name: 'Cape Town', lat: -33.9249, lng: 18.4241 },
	{ slug: 'sea-point', name: 'Sea Point', lat: -33.9169, lng: 18.3876, parent: 'cape-town' },
	{ slug: 'durban', name: 'Durban', lat: -29.8587, lng: 31.0218 }
];

const LEXICON_SEED: Array<{ term: string; entryType: LexiconEntryType; mapsTo: unknown }> = [
	{ term: 'english', entryType: 'language', mapsTo: { language: 'en' } },
	{ term: 'afrikaans', entryType: 'language', mapsTo: { language: 'af' } },
	{ term: 'zulu', entryType: 'language', mapsTo: { language: 'zu' } },
	{ term: 'xhosa', entryType: 'language', mapsTo: { language: 'xh' } },
	{ term: 'sesotho', entryType: 'language', mapsTo: { language: 'st' } },
	{ term: 'available now', entryType: 'intent_availability', mapsTo: { filter: 'available_now' } },
	{ term: 'highly rated', entryType: 'intent_rating', mapsTo: { filter: 'highly_rated' } },
	{ term: 'verified', entryType: 'intent_verification', mapsTo: { filter: 'verified' } },
	{ term: 'near me', entryType: 'intent_proximity', mapsTo: { filter: 'near_me' } }
];

export async function seedPlatform(db: Database): Promise<void> {
	for (const key of CONFIG_KEYS) {
		await db
			.insert(config)
			.values({
				key,
				value: CONFIG_DEFAULTS[key],
				updatedAt: new Date(),
				updatedBy: null
			})
			.onConflictDoNothing({ target: config.key });
	}

	const slugToId = new Map<string, string>();
	for (const area of ZA_AREAS) {
		const existing = await db.select().from(areas).where(eq(areas.slug, area.slug)).limit(1);
		if (existing[0]) {
			slugToId.set(area.slug, existing[0].id);
			continue;
		}
		const id = newId<'AreaId'>();
		slugToId.set(area.slug, id);
		await db.insert(areas).values({
			id,
			name: area.name,
			slug: area.slug,
			parentAreaId: area.parent ? (slugToId.get(area.parent) ?? null) : null,
			centroidLat: area.lat,
			centroidLng: area.lng,
			isActive: true,
			createdAt: new Date()
		});
	}

	for (const entry of LEXICON_SEED) {
		await db
			.insert(lexiconEntries)
			.values({
				id: newId<'LexiconEntryId'>(),
				term: entry.term,
				entryType: entry.entryType,
				mapsTo: entry.mapsTo,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.onConflictDoNothing();
	}
}

export async function listConfig(): Promise<
	Array<{ key: ConfigKey; value: unknown; adminEditable: boolean }>
> {
	return CONFIG_KEYS.map((key) => ({
		key,
		value: getConfig(key),
		adminEditable: key !== 'provider-availability.active_week_window_days'
	}));
}

export async function updateConfig(
	db: Database,
	input: {
		key: string;
		value: unknown;
		actor: AuthContext;
		clock: Clock;
		correlationId: string;
	}
): Promise<Result<{ key: ConfigKey; value: unknown }, UseCaseError>> {
	if (!isConfigKey(input.key)) {
		return Err({ kind: 'not_found', resource: 'config' });
	}
	if (input.key === 'provider-availability.active_week_window_days') {
		return Err({
			kind: 'forbidden',
			reason: 'That value is computed, not editable.'
		});
	}
	let value = input.value;
	if (input.key === 'platform-configuration.safety_info_html' && typeof value === 'string') {
		value = sanitizeHtml(value, SAFETY_SANITIZE);
	}
	const parsed = ConfigRegistry[input.key].safeParse(value);
	if (!parsed.success) {
		return Err({
			kind: 'validation_failed',
			issues: parsed.error.issues.map((issue) => ({
				path: issue.path.join('.') || input.key,
				message: issue.message
			}))
		});
	}

	const next = { ...Object.fromEntries(CONFIG_KEYS.map((k) => [k, getConfig(k)])) } as {
		[K in ConfigKey]: ConfigValue<K>;
	};
	next[input.key] = parsed.data as never;
	const cross = validateCrossKeys(next);
	if (cross.length > 0) {
		return Err({ kind: 'validation_failed', issues: cross });
	}

	await db.transaction(async (tx: Transaction) => {
		await tx
			.update(config)
			.set({
				value: parsed.data,
				updatedAt: new Date(input.clock.now()),
				updatedBy: input.actor.userId
			})
			.where(eq(config.key, input.key));
		await writeAudit(tx, {
			actorId: input.actor.userId,
			actorRole: 'admin',
			action: 'config.change',
			targetType: 'platform_config',
			targetId: '00000000-0000-7000-8000-000000000000',
			metadata: { key: input.key, newValue: parsed.data },
			correlationId: input.correlationId
		});
		await publish(tx, {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'ConfigChanged',
			version: 1,
			occurredAt: asInstant(input.clock.now()),
			payload: { configKey: input.key, newValue: parsed.data },
			correlationId: input.correlationId
		});
	});

	await refreshConfigKey(db, input.key);
	return Ok({ key: input.key, value: parsed.data });
}

export async function listAreas(db: Database) {
	return db.select().from(areas);
}

export async function createArea(
	db: Database,
	input: {
		name: string;
		slug: string;
		centroidLat: number;
		centroidLng: number;
		parentAreaId?: string | null;
		actor: AuthContext;
		correlationId: string;
	}
): Promise<Result<{ id: AreaId }, UseCaseError>> {
	if (
		input.centroidLat < -90 ||
		input.centroidLat > 90 ||
		input.centroidLng < -180 ||
		input.centroidLng > 180
	) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'centroid', message: 'Enter a valid latitude and longitude.' }]
		});
	}
	const id = newId<'AreaId'>();
	try {
		await db.transaction(async (tx) => {
			await tx.insert(areas).values({
				id,
				name: input.name,
				slug: input.slug,
				parentAreaId: input.parentAreaId ?? null,
				centroidLat: input.centroidLat,
				centroidLng: input.centroidLng,
				isActive: true,
				createdAt: new Date()
			});
			await writeAudit(tx, {
				actorId: input.actor.userId,
				actorRole: 'admin',
				action: 'platform-configuration.area_change',
				targetType: 'area',
				targetId: id,
				correlationId: input.correlationId
			});
		});
	} catch {
		return Err({ kind: 'conflict', reason: 'That area slug is already in use.' });
	}
	return Ok({ id });
}

export async function updateArea(
	db: Database,
	input: {
		id: string;
		name?: string;
		centroidLat?: number;
		centroidLng?: number;
		parentAreaId?: string | null;
		isActive?: boolean;
		actor: AuthContext;
		correlationId: string;
	}
): Promise<Result<{ id: string }, UseCaseError>> {
	const patch: Partial<typeof areas.$inferInsert> = {};
	if (input.name !== undefined) patch.name = input.name;
	if (input.centroidLat !== undefined) patch.centroidLat = input.centroidLat;
	if (input.centroidLng !== undefined) patch.centroidLng = input.centroidLng;
	if (input.parentAreaId !== undefined) patch.parentAreaId = input.parentAreaId;
	if (input.isActive !== undefined) patch.isActive = input.isActive;
	await db.transaction(async (tx) => {
		await tx.update(areas).set(patch).where(eq(areas.id, input.id));
		await writeAudit(tx, {
			actorId: input.actor.userId,
			actorRole: 'admin',
			action: 'platform-configuration.area_change',
			targetType: 'area',
			targetId: input.id,
			correlationId: input.correlationId
		});
	});
	return Ok({ id: input.id });
}

export async function listLexicon(db: Database) {
	return db.select().from(lexiconEntries);
}

export async function createLexiconEntry(
	db: Database,
	input: {
		term: string;
		entryType: string;
		mapsTo: unknown;
		actor: AuthContext;
		correlationId: string;
	}
): Promise<Result<{ id: LexiconEntryId }, UseCaseError>> {
	if (!LEXICON_ENTRY_TYPES.includes(input.entryType as LexiconEntryType)) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'entryType', message: 'Unknown lexicon entry type.' }]
		});
	}
	const maps = parseMapsTo(input.entryType as LexiconEntryType, input.mapsTo);
	if (!maps.success) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'mapsTo', message: 'That mapping does not match this entry type.' }]
		});
	}
	const id = newId<'LexiconEntryId'>();
	await db.transaction(async (tx) => {
		await tx.insert(lexiconEntries).values({
			id,
			term: input.term,
			entryType: input.entryType,
			mapsTo: maps.data,
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
		await writeAudit(tx, {
			actorId: input.actor.userId,
			actorRole: 'admin',
			action: 'platform-configuration.lexicon_change',
			targetType: 'lexicon_entry',
			targetId: id,
			correlationId: input.correlationId
		});
	});
	return Ok({ id });
}

export async function updateLexiconEntry(
	db: Database,
	input: {
		id: string;
		term?: string;
		mapsTo?: unknown;
		entryType?: string;
		isActive?: boolean;
		actor: AuthContext;
		correlationId: string;
	}
): Promise<Result<{ id: string }, UseCaseError>> {
	const existing = await db
		.select()
		.from(lexiconEntries)
		.where(eq(lexiconEntries.id, input.id))
		.limit(1);
	const row = existing[0];
	if (!row) return Err({ kind: 'not_found', resource: 'lexicon_entry' });
	const entryType = (input.entryType ?? row.entryType) as LexiconEntryType;
	if (input.mapsTo !== undefined) {
		const maps = parseMapsTo(entryType, input.mapsTo);
		if (!maps.success) {
			return Err({
				kind: 'validation_failed',
				issues: [{ path: 'mapsTo', message: 'That mapping does not match this entry type.' }]
			});
		}
	}
	await db.transaction(async (tx) => {
		await tx
			.update(lexiconEntries)
			.set({
				term: input.term ?? row.term,
				entryType,
				mapsTo: input.mapsTo ?? row.mapsTo,
				isActive: input.isActive ?? row.isActive,
				updatedAt: new Date()
			})
			.where(eq(lexiconEntries.id, input.id));
		await writeAudit(tx, {
			actorId: input.actor.userId,
			actorRole: 'admin',
			action: 'platform-configuration.lexicon_change',
			targetType: 'lexicon_entry',
			targetId: input.id,
			correlationId: input.correlationId
		});
	});
	return Ok({ id: input.id });
}

export async function exportUserData(
	userId: UserId,
	actor: AuthContext,
	db: Database,
	correlationId: string
) {
	actor.requireRole('admin');
	const slices = {
		'identity-and-access': await identityExportFor(userId),
		'provider-profile': await providerProfile.exportFor(userId),
		'provider-availability': await providerAvailability.exportFor(userId),
		'direct-messaging': await directMessaging.exportFor(userId),
		'provider-reviews': await providerReviews.exportFor(userId),
		'trust-and-safety': await trustAndSafety.exportFor(userId),
		'listing-billing': await listingBilling.exportFor(userId),
		'user-notifications': await userNotifications.exportFor(userId),
		'media-processing': await mediaProcessing.exportFor(userId)
	};
	await db.transaction(async (tx) => {
		await writeAudit(tx, {
			actorId: actor.userId,
			actorRole: 'admin',
			action: 'admin.export_user_data',
			targetType: 'user',
			targetId: userId,
			correlationId
		});
	});
	return { generatedAt: new Date().toISOString(), userId, slices };
}

export async function handleConfigChanged(
	payload: { configKey: string },
	db: Database
): Promise<void> {
	if (isConfigKey(payload.configKey)) {
		await refreshConfigKey(db, payload.configKey);
	}
}
