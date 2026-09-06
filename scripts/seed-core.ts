import type { Database } from '../src/lib/server/db';
import type { UserId } from '../src/lib/server/shared/ids';
import { eq, sql } from 'drizzle-orm';
import { users, adminTotp } from '../src/lib/server/modules/identity-and-access/infra/schema';
import {
	languages,
	providerLanguages,
	providerPhotos,
	providerProfiles,
	providerServiceTags,
	services,
	serviceTags
} from '../src/lib/server/modules/provider-profile/infra/schema';
import { availability } from '../src/lib/server/modules/provider-availability/infra/schema';
import { ratingAggregate, reviews } from '../src/lib/server/modules/provider-reviews/infra/schema';
import {
	providerBadges,
	badgeState
} from '../src/lib/server/modules/trust-and-safety/infra/schema';
import { listings } from '../src/lib/server/modules/listing-billing/infra/schema';
import { photos } from '../src/lib/server/modules/media-processing/infra/schema';
import {
	searchProjection,
	suggestTerm
} from '../src/lib/server/modules/discovery-search/infra/schema';
import { areas } from '../src/lib/server/modules/platform-configuration/infra/schema';
import { threads, messages } from '../src/lib/server/modules/direct-messaging/infra/schema';
import { formatIntroExtract } from '../src/lib/server/modules/discovery-search/domain/intro-extract';
import { hashPassword } from '../src/lib/server/modules/identity-and-access/infra/password-hash';
import {
	beginAdminTotpEnrollment,
	commitAdminTotpEnrollment
} from '../src/lib/server/modules/identity-and-access/infra/admin-totp-commands';

const PLACEHOLDER_CARD = '/placeholder-photo.svg';
const PLACEHOLDER_GALLERY = '/placeholder-photo.svg';

/** Fixed trial end for seeded free-listed providers (within E2E trial-ending reminder window). */
export const SEED_TRIAL_ENDS_AT = new Date('2026-09-09T10:00:00Z');

/** Thandi's last activity for US-VIEW-02 coarse-presence fixtures (paired with integration-test anchor). */
export const SEED_VIEW02_THANDI_ACTIVITY_AT = new Date('2026-09-03T12:00:00.000Z');

const LANGUAGE_SEED = [
	{ code: 'en', name: 'English', sortOrder: 1 },
	{ code: 'af', name: 'Afrikaans', sortOrder: 2 },
	{ code: 'zu', name: 'Zulu', sortOrder: 3 },
	{ code: 'xh', name: 'Xhosa', sortOrder: 4 },
	{ code: 'st', name: 'Sotho', sortOrder: 5 }
];

const TAG_SEED = [
	{ id: '01900000-0000-7000-8000-000000000201', name: 'Deep tissue', slug: 'deep-tissue' },
	{ id: '01900000-0000-7000-8000-000000000202', name: 'Swedish', slug: 'swedish' },
	{ id: '01900000-0000-7000-8000-000000000203', name: 'Sports massage', slug: 'sports-massage' }
];

type ProviderSeed = {
	userId: string;
	profileId: string;
	photoId: string;
	providerPhotoId: string;
	serviceId: string;
	displayName: string;
	phone: string;
	phoneVisible: boolean;
	areaSlug: string;
	intro: string;
	available: boolean;
	availabilitySetAt: Date | null;
	verified: boolean;
	activeThisWeek: boolean;
	featured: boolean;
	rating: { average: number; count: number } | null;
	reviewCount: number;
	tagSlug: string;
	languageCode: string;
};

const PROVIDERS: ProviderSeed[] = [
	{
		userId: '01900000-0000-7000-8000-000000000001',
		profileId: '01900000-0000-7000-8000-000000000101',
		photoId: '01900000-0000-7000-8000-000000000301',
		providerPhotoId: '01900000-0000-7000-8000-000000000401',
		serviceId: '01900000-0000-7000-8000-000000000501',
		displayName: 'Amara T.',
		phone: '+27821234001',
		phoneVisible: true,
		areaSlug: 'rosebank',
		intro: 'Deep tissue specialist helping you unwind after long work weeks.',
		available: true,
		availabilitySetAt: new Date('2026-09-04T18:00:00Z'),
		verified: true,
		activeThisWeek: true,
		featured: true,
		rating: { average: 4.9, count: 128 },
		reviewCount: 6,
		tagSlug: 'deep-tissue',
		languageCode: 'en'
	},
	{
		userId: '01900000-0000-7000-8000-000000000002',
		profileId: '01900000-0000-7000-8000-000000000102',
		photoId: '01900000-0000-7000-8000-000000000302',
		providerPhotoId: '01900000-0000-7000-8000-000000000402',
		serviceId: '01900000-0000-7000-8000-000000000502',
		displayName: 'Thandi M.',
		phone: '+27821234002',
		phoneVisible: false,
		areaSlug: 'sandton',
		intro: 'Swedish massage with a calm, restorative touch.',
		available: true,
		availabilitySetAt: new Date('2026-09-04T16:30:00Z'),
		verified: true,
		activeThisWeek: false,
		featured: false,
		rating: { average: 4.7, count: 42 },
		reviewCount: 1,
		tagSlug: 'swedish',
		languageCode: 'zu'
	},
	{
		userId: '01900000-0000-7000-8000-000000000003',
		profileId: '01900000-0000-7000-8000-000000000103',
		photoId: '01900000-0000-7000-8000-000000000303',
		providerPhotoId: '01900000-0000-7000-8000-000000000403',
		serviceId: '01900000-0000-7000-8000-000000000503',
		displayName: 'Lerato K.',
		phone: '+27821234003',
		phoneVisible: true,
		areaSlug: 'johannesburg',
		intro: 'Sports recovery massage for active lifestyles.',
		available: true,
		availabilitySetAt: new Date('2026-09-04T19:15:00Z'),
		verified: false,
		activeThisWeek: true,
		featured: false,
		rating: null,
		reviewCount: 0,
		tagSlug: 'sports-massage',
		languageCode: 'en'
	},
	{
		userId: '01900000-0000-7000-8000-000000000004',
		profileId: '01900000-0000-7000-8000-000000000104',
		photoId: '01900000-0000-7000-8000-000000000304',
		providerPhotoId: '01900000-0000-7000-8000-000000000404',
		serviceId: '01900000-0000-7000-8000-000000000504',
		displayName: 'Nomsa P.',
		phone: '+27821234004',
		phoneVisible: false,
		areaSlug: 'pretoria',
		intro: 'Gentle Swedish sessions in a warm, private studio.',
		available: false,
		availabilitySetAt: null,
		verified: true,
		activeThisWeek: true,
		featured: false,
		rating: { average: 4.5, count: 8 },
		reviewCount: 0,
		tagSlug: 'swedish',
		languageCode: 'st'
	},
	{
		userId: '01900000-0000-7000-8000-000000000005',
		profileId: '01900000-0000-7000-8000-000000000105',
		photoId: '01900000-0000-7000-8000-000000000305',
		providerPhotoId: '01900000-0000-7000-8000-000000000405',
		serviceId: '01900000-0000-7000-8000-000000000505',
		displayName: 'Zanele D.',
		phone: '+27821234005',
		phoneVisible: true,
		areaSlug: 'cape-town',
		intro: 'Deep tissue relief with mindful pressure.',
		available: false,
		availabilitySetAt: null,
		verified: false,
		activeThisWeek: false,
		featured: true,
		rating: { average: 4.2, count: 5 },
		reviewCount: 0,
		tagSlug: 'deep-tissue',
		languageCode: 'xh'
	},
	{
		userId: '01900000-0000-7000-8000-000000000006',
		profileId: '01900000-0000-7000-8000-000000000106',
		photoId: '01900000-0000-7000-8000-000000000306',
		providerPhotoId: '01900000-0000-7000-8000-000000000406',
		serviceId: '01900000-0000-7000-8000-000000000506',
		displayName: 'Sipho N.',
		phone: '+27821234006',
		phoneVisible: false,
		areaSlug: 'sea-point',
		intro: 'Sports massage focused on mobility and recovery.',
		available: true,
		availabilitySetAt: new Date('2026-09-04T14:00:00Z'),
		verified: true,
		activeThisWeek: false,
		featured: false,
		rating: { average: 5.0, count: 12 },
		reviewCount: 0,
		tagSlug: 'sports-massage',
		languageCode: 'af'
	},
	{
		userId: '01900000-0000-7000-8000-000000000007',
		profileId: '01900000-0000-7000-8000-000000000107',
		photoId: '01900000-0000-7000-8000-000000000307',
		providerPhotoId: '01900000-0000-7000-8000-000000000407',
		serviceId: '01900000-0000-7000-8000-000000000507',
		displayName: 'Ayanda R.',
		phone: '+27821234007',
		phoneVisible: true,
		areaSlug: 'durban',
		intro: 'Swedish and deep tissue blend for full-body calm.',
		available: false,
		availabilitySetAt: null,
		verified: true,
		activeThisWeek: true,
		featured: false,
		rating: { average: 4.8, count: 67 },
		reviewCount: 0,
		tagSlug: 'swedish',
		languageCode: 'zu'
	},
	{
		userId: '01900000-0000-7000-8000-000000000008',
		profileId: '01900000-0000-7000-8000-000000000108',
		photoId: '01900000-0000-7000-8000-000000000308',
		providerPhotoId: '01900000-0000-7000-8000-000000000408',
		serviceId: '01900000-0000-7000-8000-000000000508',
		displayName: 'Kagiso L.',
		phone: '+27821234008',
		phoneVisible: false,
		areaSlug: 'rosebank',
		intro: 'Therapeutic deep tissue for desk-bound professionals.',
		available: true,
		availabilitySetAt: new Date('2026-09-04T17:45:00Z'),
		verified: false,
		activeThisWeek: false,
		featured: false,
		rating: null,
		reviewCount: 0,
		tagSlug: 'deep-tissue',
		languageCode: 'en'
	},
	{
		userId: '01900000-0000-7000-8000-000000000009',
		profileId: '01900000-0000-7000-8000-000000000109',
		photoId: '01900000-0000-7000-8000-000000000309',
		providerPhotoId: '01900000-0000-7000-8000-000000000409',
		serviceId: '01900000-0000-7000-8000-000000000509',
		displayName: 'Naledi S.',
		phone: '+27821234009',
		phoneVisible: true,
		areaSlug: 'sandton',
		intro: 'Swedish relaxation with aromatherapy accents.',
		available: false,
		availabilitySetAt: null,
		verified: true,
		activeThisWeek: false,
		featured: true,
		rating: { average: 4.6, count: 23 },
		reviewCount: 0,
		tagSlug: 'swedish',
		languageCode: 'en'
	},
	{
		userId: '01900000-0000-7000-8000-00000000000a',
		profileId: '01900000-0000-7000-8000-00000000010a',
		photoId: '01900000-0000-7000-8000-00000000030a',
		providerPhotoId: '01900000-0000-7000-8000-00000000040a',
		serviceId: '01900000-0000-7000-8000-00000000050a',
		displayName: 'Boitumelo H.',
		phone: '+27821234010',
		phoneVisible: false,
		areaSlug: 'johannesburg',
		intro: 'Sports massage for runners and cyclists.',
		available: true,
		availabilitySetAt: new Date('2026-09-04T15:00:00Z'),
		verified: true,
		activeThisWeek: true,
		featured: false,
		rating: { average: 4.4, count: 15 },
		reviewCount: 0,
		tagSlug: 'sports-massage',
		languageCode: 'st'
	},
	{
		userId: '01900000-0000-7000-8000-00000000000b',
		profileId: '01900000-0000-7000-8000-00000000010b',
		photoId: '01900000-0000-7000-8000-00000000030b',
		providerPhotoId: '01900000-0000-7000-8000-00000000040b',
		serviceId: '01900000-0000-7000-8000-00000000050b',
		displayName: 'Mandla Z.',
		phone: '+27821234011',
		phoneVisible: true,
		areaSlug: 'cape-town',
		intro: 'Deep tissue and trigger-point work.',
		available: false,
		availabilitySetAt: null,
		verified: false,
		activeThisWeek: false,
		featured: false,
		rating: { average: 3.9, count: 4 },
		reviewCount: 0,
		tagSlug: 'deep-tissue',
		languageCode: 'xh'
	},
	{
		userId: '01900000-0000-7000-8000-00000000000c',
		profileId: '01900000-0000-7000-8000-00000000010c',
		photoId: '01900000-0000-7000-8000-00000000030c',
		providerPhotoId: '01900000-0000-7000-8000-00000000040c',
		serviceId: '01900000-0000-7000-8000-00000000050c',
		displayName: 'Refilwe G.',
		phone: '+27821234012',
		phoneVisible: false,
		areaSlug: 'durban',
		intro: 'Swedish massage with focus on stress relief.',
		available: true,
		availabilitySetAt: new Date('2026-09-04T12:00:00Z'),
		verified: true,
		activeThisWeek: false,
		featured: false,
		rating: { average: 4.9, count: 6 },
		reviewCount: 0,
		tagSlug: 'swedish',
		languageCode: 'zu'
	}
];

const REVIEWER_ID = '01900000-0000-7000-8000-000000000099';

const VIEW_05_REVIEWERS = [
	{
		id: '01900000-0000-7000-8000-000000000c01',
		displayName: 'Thandi Mokoena',
		email: 'thandi.view05@example.com'
	},
	{
		id: '01900000-0000-7000-8000-000000000c02',
		displayName: 'Naledi Sithole',
		email: 'naledi.view05@example.com'
	},
	{
		id: '01900000-0000-7000-8000-000000000c03',
		displayName: 'Chris Khumalo',
		email: 'chris.view05@example.com'
	},
	{
		id: '01900000-0000-7000-8000-000000000c04',
		displayName: 'Priya Naidoo',
		email: 'priya.view05@example.com'
	},
	{
		id: '01900000-0000-7000-8000-000000000c05',
		displayName: 'Daniel Kgatle',
		email: 'daniel.view05@example.com'
	},
	{
		id: '01900000-0000-7000-8000-000000000c06',
		displayName: 'Sipho Dlamini',
		email: 'sipho.view05@example.com'
	}
] as const;

export const SEED_VIEW_05_NEWEST_REVIEWER_LABEL = 'Thandi M.';
export const SEED_VIEW_05_EDITED_REVIEW_BODY =
	'Updated after my second visit — even better pressure and focus on my shoulders.';
export const SEED_VIEW_05_REPLY_BODY =
	'Thank you, Thandi — glad the follow-up session hit the spot. See you next month.';
export const SEED_VIEW_05_REVIEW_COUNT = 6;

export const SEED_DUAL_ROLE_USER_ID = '01900000-0000-7000-8000-000000000098';
export const SEED_DUAL_ROLE_PROFILE_ID = '01900000-0000-7000-8000-000000000198';
export const SEED_DUAL_ROLE_EMAIL = 'dual@example.com';
export const SEED_DUAL_ROLE_PASSWORD = 'password123';
export const SEED_DUAL_ROLE_SEEKER_THREAD_PREVIEW =
	'Hi Amara — looking for a deep tissue session this week.';
export const SEED_DUAL_ROLE_PROVIDER_INBOX_PREVIEW =
	'Are you free this afternoon for a Swedish massage?';

export const SEED_ADMIN_USER_ID = '01900000-0000-7000-8000-000000000097';
export const SEED_ADMIN_EMAIL = 'admin@example.com';
export const SEED_ADMIN_PASSWORD = 'adminpass123';

export async function seedCore(db: Database): Promise<void> {
	for (const lang of LANGUAGE_SEED) {
		await db.insert(languages).values(lang).onConflictDoNothing();
	}
	for (const tag of TAG_SEED) {
		await db.insert(serviceTags).values(tag).onConflictDoNothing();
	}

	const areaRows = await db.select().from(areas);
	const areaBySlug = new Map(areaRows.map((a) => [a.slug, a.id]));

	const adminPasswordHash = await hashPassword(SEED_ADMIN_PASSWORD);
	await db
		.insert(users)
		.values({
			id: SEED_ADMIN_USER_ID,
			displayName: 'Platform Admin',
			email: SEED_ADMIN_EMAIL,
			emailVerifiedAt: new Date(),
			passwordHash: adminPasswordHash,
			isAdmin: true,
			status: 'active'
		})
		.onConflictDoUpdate({
			target: users.id,
			set: {
				displayName: 'Platform Admin',
				email: SEED_ADMIN_EMAIL,
				passwordHash: adminPasswordHash,
				isAdmin: true,
				status: 'active',
				deletedAt: null,
				anonymizedAt: null
			}
		});

	await db.delete(adminTotp).where(eq(adminTotp.userId, SEED_ADMIN_USER_ID));

	const started = beginAdminTotpEnrollment(SEED_ADMIN_EMAIL);
	await commitAdminTotpEnrollment(db, {
		userId: SEED_ADMIN_USER_ID as UserId,
		secret: started.secret,
		backupCodes: started.result.backupCodes,
		now: new Date()
	});

	await db
		.insert(users)
		.values({
			id: REVIEWER_ID,
			displayName: 'Seeker Sample',
			email: 'seeker@example.com',
			emailVerifiedAt: new Date(),
			status: 'active'
		})
		.onConflictDoNothing();

	const publishedAt = new Date('2026-08-01T10:00:00Z');
	const trialEndsAt = SEED_TRIAL_ENDS_AT;

	for (const p of PROVIDERS) {
		const areaId = areaBySlug.get(p.areaSlug);
		if (!areaId) throw new Error(`missing area ${p.areaSlug}`);

		const tag = TAG_SEED.find((t) => t.slug === p.tagSlug)!;

		await db
			.insert(users)
			.values({
				id: p.userId,
				displayName: p.displayName,
				phone: p.phone,
				phoneVerifiedAt: new Date(),
				status: 'active'
			})
			.onConflictDoNothing();

		await db
			.insert(providerProfiles)
			.values({
				id: p.profileId,
				ownerId: p.userId,
				areaId,
				intro: p.intro,
				publishState: 'published',
				phoneVisible: p.phoneVisible,
				firstPublishedAt: publishedAt,
				updatedAt: new Date()
			})
			.onConflictDoNothing();

		await db
			.insert(services)
			.values({
				id: p.serviceId,
				providerProfileId: p.profileId,
				name: '60 minute session',
				description: 'Full body massage',
				durationMinutes: 60,
				priceCents: 65000,
				sortOrder: 0
			})
			.onConflictDoNothing();

		await db
			.insert(providerServiceTags)
			.values({
				providerProfileId: p.profileId,
				serviceTagId: tag.id
			})
			.onConflictDoNothing();

		await db
			.insert(providerLanguages)
			.values({
				providerProfileId: p.profileId,
				languageCode: p.languageCode
			})
			.onConflictDoNothing();

		await db
			.insert(photos)
			.values({
				id: p.photoId,
				ownerId: p.userId,
				bucket: 'media',
				status: 'ready',
				objectKey: 'seed/placeholder',
				contentHash: `seed-${p.photoId}`,
				mimeType: 'image/svg+xml',
				sizeBytes: 0
			})
			.onConflictDoNothing();

		await db.execute(sql`
			insert into media_processing.photo_variant (photo_id, variant, url, width, height)
			values
				(${p.photoId}::uuid, 'card_640_webp', ${PLACEHOLDER_CARD}, 640, 480),
				(${p.photoId}::uuid, 'gallery_1280_webp', ${PLACEHOLDER_GALLERY}, 1280, 720)
			on conflict do nothing
		`);

		await db
			.insert(providerPhotos)
			.values({
				id: p.providerPhotoId,
				providerProfileId: p.profileId,
				photoId: p.photoId,
				status: 'ready',
				sortOrder: 0,
				isPrimary: true
			})
			.onConflictDoNothing();

		await db
			.insert(availability)
			.values({
				providerProfileId: p.profileId,
				state: p.available ? 'available' : 'not_available',
				setAt: p.availabilitySetAt,
				updatedAt: new Date()
			})
			.onConflictDoNothing();

		if (p.rating) {
			await db
				.insert(ratingAggregate)
				.values({
					providerProfileId: p.profileId,
					average: String(p.rating.average),
					count: p.rating.count,
					updatedAt: new Date()
				})
				.onConflictDoNothing();
		}

		if (p.verified) {
			await db
				.insert(providerBadges)
				.values({
					providerProfileId: p.profileId,
					badge: 'identity_verified'
				})
				.onConflictDoNothing();
			await db
				.insert(badgeState)
				.values({
					providerProfileId: p.profileId,
					identityVerified: true,
					identityVerifiedSince: publishedAt,
					suppressed: false,
					activeThisWeek: p.activeThisWeek,
					activeThisWeekSince: p.activeThisWeek ? publishedAt : null,
					updatedAt: new Date()
				})
				.onConflictDoUpdate({
					target: badgeState.providerProfileId,
					set: {
						identityVerified: true,
						identityVerifiedSince: publishedAt,
						updatedAt: new Date()
					}
				});
		} else if (p.activeThisWeek) {
			await db
				.insert(badgeState)
				.values({
					providerProfileId: p.profileId,
					identityVerified: false,
					activeThisWeek: true,
					activeThisWeekSince: publishedAt,
					updatedAt: new Date()
				})
				.onConflictDoNothing();
		}
		if (p.activeThisWeek) {
			await db
				.insert(providerBadges)
				.values({
					providerProfileId: p.profileId,
					badge: 'active_this_week'
				})
				.onConflictDoNothing();
		}

		await db
			.insert(listings)
			.values({
				providerProfileId: p.profileId,
				state: 'free_listed',
				trialStartedAt: publishedAt,
				trialEndsAt,
				updatedAt: new Date()
			})
			.onConflictDoNothing();

		const searchText = `${p.intro} 60 minute session ${tag.name}`;
		const introExtract = formatIntroExtract(p.intro);
		await db
			.insert(searchProjection)
			.values({
				providerProfileId: p.profileId,
				ownerId: p.userId,
				displayName: p.displayName,
				searchText,
				introExtract,
				serviceTagIds: [tag.id],
				languageCodes: [p.languageCode],
				areaId,
				priceMinCents: 65000,
				priceMaxCents: 65000,
				availabilityState: p.available ? 'available' : 'not_available',
				availabilitySetAt: p.availabilitySetAt,
				ratingAverage: p.rating ? String(p.rating.average) : null,
				ratingCount: p.rating?.count ?? 0,
				badgeIdentityVerified: p.verified,
				badgeActiveThisWeek: p.activeThisWeek,
				isFeatured: p.featured,
				featuredSince: p.featured ? publishedAt : null,
				lastActivityAt: p.availabilitySetAt ?? publishedAt,
				photoPrimaryUrl: PLACEHOLDER_CARD,
				publishedAt,
				updatedAt: new Date()
			})
			.onConflictDoNothing();
	}

	// US-VIEW-05 review fixtures for Amara T.
	const amara = PROVIDERS[0]!;
	const thandi = PROVIDERS[1]!;
	await seedView05Reviews(db, amara.profileId);

	await seedAmaraProfileExtras(db, amara);
	await seedView02PresenceFixtures(db, thandi);

	const suggestRows = [
		{ term: 'deep tissue', kind: 'service' },
		{ term: 'swedish', kind: 'service' },
		{ term: 'sports massage', kind: 'service' },
		{ term: 'zulu', kind: 'language' },
		{ term: 'available now', kind: 'intent' },
		{ term: 'verified', kind: 'intent' },
		{ term: 'rosebank', kind: 'area' },
		{ term: 'sandton', kind: 'area' }
	];
	for (const row of suggestRows) {
		await db.insert(suggestTerm).values(row).onConflictDoNothing();
	}

	await seedDualRoleUser(db, areaBySlug, publishedAt);
}

async function seedView05Reviews(db: Database, providerProfileId: string): Promise<void> {
	await db.delete(reviews).where(eq(reviews.providerProfileId, providerProfileId));

	for (const reviewer of VIEW_05_REVIEWERS) {
		await db
			.insert(users)
			.values({
				id: reviewer.id,
				displayName: reviewer.displayName,
				email: reviewer.email,
				emailVerifiedAt: new Date(),
				status: 'active'
			})
			.onConflictDoNothing();
	}

	const fixtures = [
		{
			id: '01900000-0000-7000-8000-000000000701',
			reviewerId: VIEW_05_REVIEWERS[0]!.id,
			rating: 5,
			body: 'Booked for lower back pain after a long drive. Amara found the exact spot and the relief lasted for days.',
			createdAt: new Date('2026-09-01T12:00:00Z'),
			isEdited: false,
			replyBody: SEED_VIEW_05_REPLY_BODY,
			repliedAt: new Date('2026-09-02T14:00:00Z')
		},
		{
			id: '01900000-0000-7000-8000-000000000702',
			reviewerId: VIEW_05_REVIEWERS[1]!.id,
			rating: 5,
			body: SEED_VIEW_05_EDITED_REVIEW_BODY,
			createdAt: new Date('2026-08-28T12:00:00Z'),
			isEdited: true,
			editedAt: new Date('2026-08-29T09:00:00Z')
		},
		{
			id: '01900000-0000-7000-8000-000000000703',
			reviewerId: VIEW_05_REVIEWERS[2]!.id,
			rating: 5,
			body: 'On time, professional, and the room was calm and clean. Already rebooked for next month.',
			createdAt: new Date('2026-08-22T12:00:00Z'),
			isEdited: false
		},
		{
			id: '01900000-0000-7000-8000-000000000704',
			reviewerId: VIEW_05_REVIEWERS[3]!.id,
			rating: 4,
			body: 'Great sports massage before my race. Would ask for a bit more pressure next time, but overall excellent.',
			createdAt: new Date('2026-08-18T12:00:00Z'),
			isEdited: false
		},
		{
			id: '01900000-0000-7000-8000-000000000705',
			reviewerId: VIEW_05_REVIEWERS[4]!.id,
			rating: 5,
			body: 'Deep tissue exactly where I needed it — shoulders feel brand new.',
			createdAt: new Date('2026-08-12T12:00:00Z'),
			isEdited: false
		},
		{
			id: '01900000-0000-7000-8000-000000000706',
			reviewerId: VIEW_05_REVIEWERS[5]!.id,
			rating: 5,
			body: 'Warm, skilled, and listened to what I wanted. Highly recommend.',
			createdAt: new Date('2026-08-05T12:00:00Z'),
			isEdited: false
		}
	] as const;

	for (const fixture of fixtures) {
		await db
			.insert(reviews)
			.values({
				id: fixture.id,
				providerProfileId,
				reviewerId: fixture.reviewerId,
				rating: fixture.rating,
				body: fixture.body,
				createdAt: fixture.createdAt,
				isEdited: fixture.isEdited,
				editedAt: 'editedAt' in fixture ? fixture.editedAt : null,
				replyBody: 'replyBody' in fixture ? fixture.replyBody : null,
				repliedAt: 'repliedAt' in fixture ? fixture.repliedAt : null
			})
			.onConflictDoNothing();
	}
}

async function seedAmaraProfileExtras(db: Database, amara: ProviderSeed): Promise<void> {
	const extraPhotos = [
		{
			photoId: '01900000-0000-7000-8000-000000000311',
			providerPhotoId: '01900000-0000-7000-8000-000000000411',
			sortOrder: 1
		},
		{
			photoId: '01900000-0000-7000-8000-000000000312',
			providerPhotoId: '01900000-0000-7000-8000-000000000412',
			sortOrder: 2
		}
	];

	for (const photo of extraPhotos) {
		await db
			.insert(photos)
			.values({
				id: photo.photoId,
				ownerId: amara.userId,
				bucket: 'media',
				status: 'ready',
				objectKey: 'seed/placeholder',
				contentHash: `seed-${photo.photoId}`,
				mimeType: 'image/svg+xml',
				sizeBytes: 0
			})
			.onConflictDoNothing();

		await db.execute(sql`
			insert into media_processing.photo_variant (photo_id, variant, url, width, height)
			values
				(${photo.photoId}::uuid, 'card_640_webp', ${PLACEHOLDER_CARD}, 640, 480),
				(${photo.photoId}::uuid, 'gallery_1280_webp', ${PLACEHOLDER_GALLERY}, 1280, 720)
			on conflict do nothing
		`);

		await db
			.insert(providerPhotos)
			.values({
				id: photo.providerPhotoId,
				providerProfileId: amara.profileId,
				photoId: photo.photoId,
				status: 'ready',
				sortOrder: photo.sortOrder,
				isPrimary: false
			})
			.onConflictDoNothing();
	}

	const responseSeekers = [
		'01900000-0000-7000-8000-000000000091',
		'01900000-0000-7000-8000-000000000092',
		'01900000-0000-7000-8000-000000000093'
	];

	for (let i = 0; i < responseSeekers.length; i++) {
		const seekerId = responseSeekers[i]!;
		const threadId = `01900000-0000-7000-8000-0000000008${String(i).padStart(2, '0')}`;
		const seekerMessageId = `01900000-0000-7000-8000-0000000009${String(i).padStart(2, '0')}`;
		const providerReplyId = `01900000-0000-7000-8000-000000000a${String(i).padStart(2, '0')}`;
		const threadCreated = new Date(`2026-09-01T10:00:00Z`);
		const providerReplyAt = new Date(threadCreated.getTime() + 10 * 60_000);

		await db
			.insert(users)
			.values({
				id: seekerId,
				displayName: `Response seeker ${i + 1}`,
				email: `response-seeker-${i + 1}@example.com`,
				emailVerifiedAt: new Date(),
				status: 'active'
			})
			.onConflictDoNothing();

		await db
			.insert(threads)
			.values({
				id: threadId,
				seekerId,
				providerProfileId: amara.profileId,
				createdAt: threadCreated,
				lastActivityAt: providerReplyAt
			})
			.onConflictDoNothing();

		await db
			.insert(messages)
			.values({
				id: seekerMessageId,
				threadId,
				senderId: seekerId,
				body: 'Are you available this week?',
				sentAt: threadCreated
			})
			.onConflictDoNothing();

		await db
			.insert(messages)
			.values({
				id: providerReplyId,
				threadId,
				senderId: amara.userId,
				body: 'Yes, I have openings — let me know what works.',
				sentAt: providerReplyAt
			})
			.onConflictDoNothing();
	}

	const recentPresenceAt = new Date();
	const presenceThreadId = '01900000-0000-7000-8000-000000000800';
	await db
		.insert(threads)
		.values({
			id: presenceThreadId,
			seekerId: REVIEWER_ID,
			providerProfileId: amara.profileId,
			createdAt: new Date(recentPresenceAt.getTime() - 60_000),
			lastActivityAt: recentPresenceAt
		})
		.onConflictDoNothing();

	await db
		.insert(messages)
		.values({
			id: '01900000-0000-7000-8000-000000000b01',
			threadId: presenceThreadId,
			senderId: amara.userId,
			body: 'Recent activity for presence display.',
			sentAt: recentPresenceAt
		})
		.onConflictDoNothing();
}

async function seedView02PresenceFixtures(db: Database, thandi: ProviderSeed): Promise<void> {
	const threadId = '01900000-0000-7000-8000-000000000c01';

	await db
		.insert(threads)
		.values({
			id: threadId,
			seekerId: REVIEWER_ID,
			providerProfileId: thandi.profileId,
			createdAt: new Date(SEED_VIEW02_THANDI_ACTIVITY_AT.getTime() - 60_000),
			lastActivityAt: SEED_VIEW02_THANDI_ACTIVITY_AT
		})
		.onConflictDoNothing();

	await db
		.insert(messages)
		.values({
			id: '01900000-0000-7000-8000-000000000c02',
			threadId,
			senderId: thandi.userId,
			body: 'Thanks — see you then.',
			sentAt: SEED_VIEW02_THANDI_ACTIVITY_AT
		})
		.onConflictDoNothing();
}

async function seedDualRoleUser(
	db: Database,
	areaBySlug: Map<string, string>,
	publishedAt: Date
): Promise<void> {
	const amara = PROVIDERS[0]!;
	const thandi = PROVIDERS[1]!;
	const areaId = areaBySlug.get('rosebank');
	if (!areaId) throw new Error('missing area rosebank for dual-role seed');

	const passwordHash = await hashPassword(SEED_DUAL_ROLE_PASSWORD);

	await db
		.insert(users)
		.values({
			id: SEED_DUAL_ROLE_USER_ID,
			displayName: 'Jordan B.',
			email: SEED_DUAL_ROLE_EMAIL,
			emailVerifiedAt: new Date('2026-08-01T10:00:00Z'),
			phone: '+27821234098',
			phoneVerifiedAt: new Date('2026-08-01T10:00:00Z'),
			passwordHash,
			status: 'active'
		})
		.onConflictDoNothing();

	const tag = TAG_SEED[1]!;

	await db
		.insert(providerProfiles)
		.values({
			id: SEED_DUAL_ROLE_PROFILE_ID,
			ownerId: SEED_DUAL_ROLE_USER_ID,
			areaId,
			intro: 'Swedish and deep tissue — book as a seeker, practice as a provider.',
			publishState: 'published',
			phoneVisible: true,
			firstPublishedAt: publishedAt,
			createdAt: publishedAt,
			updatedAt: publishedAt
		})
		.onConflictDoNothing();

	await db
		.insert(services)
		.values({
			id: '01900000-0000-7000-8000-000000000598',
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			name: '60 minute session',
			durationMinutes: 60,
			priceCents: 70000,
			sortOrder: 0
		})
		.onConflictDoNothing();

	await db
		.insert(providerServiceTags)
		.values({
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			serviceTagId: tag.id
		})
		.onConflictDoNothing();

	await db
		.insert(listings)
		.values({
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			state: 'free_listed',
			trialStartedAt: publishedAt,
			trialEndsAt: SEED_TRIAL_ENDS_AT,
			updatedAt: publishedAt
		})
		.onConflictDoNothing();

	await db
		.insert(searchProjection)
		.values({
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			ownerId: SEED_DUAL_ROLE_USER_ID,
			displayName: 'Jordan B.',
			searchText: 'Swedish and deep tissue dual role provider',
			introExtract: formatIntroExtract(
				'Swedish and deep tissue — book as a seeker, practice as a provider.'
			),
			serviceTagIds: [tag.id],
			languageCodes: ['en'],
			areaId,
			priceMinCents: 70000,
			priceMaxCents: 70000,
			availabilityState: 'available',
			availabilitySetAt: new Date('2026-09-04T14:00:00Z'),
			ratingAverage: null,
			ratingCount: 0,
			badgeIdentityVerified: false,
			badgeActiveThisWeek: true,
			isFeatured: false,
			featuredSince: null,
			lastActivityAt: new Date('2026-09-04T14:00:00Z'),
			photoPrimaryUrl: PLACEHOLDER_CARD,
			publishedAt,
			updatedAt: publishedAt
		})
		.onConflictDoNothing();

	const seekerThreadId = '01900000-0000-7000-8000-000000000881';
	await db
		.insert(threads)
		.values({
			id: seekerThreadId,
			seekerId: SEED_DUAL_ROLE_USER_ID,
			providerProfileId: amara.profileId,
			createdAt: new Date('2026-09-03T10:00:00Z'),
			lastActivityAt: new Date('2026-09-03T10:00:00Z')
		})
		.onConflictDoNothing();
	await db
		.insert(messages)
		.values({
			id: '01900000-0000-7000-8000-000000000882',
			threadId: seekerThreadId,
			senderId: SEED_DUAL_ROLE_USER_ID,
			body: SEED_DUAL_ROLE_SEEKER_THREAD_PREVIEW,
			sentAt: new Date('2026-09-03T10:00:00Z')
		})
		.onConflictDoNothing();

	const providerThreadId = '01900000-0000-7000-8000-000000000883';
	await db
		.insert(threads)
		.values({
			id: providerThreadId,
			seekerId: REVIEWER_ID,
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			createdAt: new Date('2026-09-03T11:00:00Z'),
			lastActivityAt: new Date('2026-09-03T11:00:00Z')
		})
		.onConflictDoNothing();
	await db
		.insert(messages)
		.values({
			id: '01900000-0000-7000-8000-000000000884',
			threadId: providerThreadId,
			senderId: REVIEWER_ID,
			body: SEED_DUAL_ROLE_PROVIDER_INBOX_PREVIEW,
			sentAt: new Date('2026-09-03T11:00:00Z')
		})
		.onConflictDoNothing();

	await db
		.insert(reviews)
		.values({
			id: '01900000-0000-7000-8000-000000000885',
			providerProfileId: thandi.profileId,
			reviewerId: SEED_DUAL_ROLE_USER_ID,
			rating: 5,
			body: 'Great Swedish session — seeker review only.',
			createdAt: new Date('2026-08-15T12:00:00Z')
		})
		.onConflictDoNothing();

	await db
		.insert(reviews)
		.values({
			id: '01900000-0000-7000-8000-000000000886',
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			reviewerId: REVIEWER_ID,
			rating: 4,
			body: 'Professional and welcoming studio.',
			createdAt: new Date('2026-08-20T12:00:00Z')
		})
		.onConflictDoNothing();

	// Idempotent restore so E2E re-runs can reset a deleted dual-role fixture.
	await db
		.update(users)
		.set({
			displayName: 'Jordan B.',
			email: SEED_DUAL_ROLE_EMAIL,
			emailVerifiedAt: new Date('2026-08-01T10:00:00Z'),
			phone: '+27821234098',
			phoneVerifiedAt: new Date('2026-08-01T10:00:00Z'),
			passwordHash,
			status: 'active',
			deletedAt: null,
			anonymizedAt: null,
			updatedAt: publishedAt
		})
		.where(eq(users.id, SEED_DUAL_ROLE_USER_ID));

	await db
		.update(providerProfiles)
		.set({
			publishState: 'published',
			unpublishReason: null,
			updatedAt: publishedAt
		})
		.where(eq(providerProfiles.id, SEED_DUAL_ROLE_PROFILE_ID));

	await db
		.update(listings)
		.set({
			state: 'free_listed',
			trialStartedAt: publishedAt,
			trialEndsAt: SEED_TRIAL_ENDS_AT,
			updatedAt: publishedAt
		})
		.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

	await db
		.insert(searchProjection)
		.values({
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			ownerId: SEED_DUAL_ROLE_USER_ID,
			displayName: 'Jordan B.',
			searchText: 'Swedish and deep tissue dual role provider',
			introExtract: formatIntroExtract(
				'Swedish and deep tissue — book as a seeker, practice as a provider.'
			),
			serviceTagIds: [tag.id],
			languageCodes: ['en'],
			areaId,
			priceMinCents: 70000,
			priceMaxCents: 70000,
			availabilityState: 'available',
			availabilitySetAt: new Date('2026-09-04T14:00:00Z'),
			ratingAverage: null,
			ratingCount: 0,
			badgeIdentityVerified: false,
			badgeActiveThisWeek: true,
			isFeatured: false,
			featuredSince: null,
			lastActivityAt: new Date('2026-09-04T14:00:00Z'),
			photoPrimaryUrl: PLACEHOLDER_CARD,
			publishedAt,
			updatedAt: publishedAt
		})
		.onConflictDoUpdate({
			target: searchProjection.providerProfileId,
			set: {
				ownerId: SEED_DUAL_ROLE_USER_ID,
				displayName: 'Jordan B.',
				searchText: 'Swedish and deep tissue dual role provider',
				updatedAt: publishedAt
			}
		});
}

export const SEED_CORE_PRIMARY_PROFILE_ID = PROVIDERS[0]!.profileId;
export const SEED_CORE_PHONE_ON_NUMBER = PROVIDERS[0]!.phone;
export const SEED_CORE_PHONE_OFF_PROFILE_ID = PROVIDERS[1]!.profileId;
export const SEED_CORE_PHONE_OFF_NUMBER = PROVIDERS[1]!.phone;
export const SEED_CORE_PHONE_OFF_DISPLAY_NAME = PROVIDERS[1]!.displayName;
export const SEED_CORE_ZERO_REVIEW_PROFILE_ID = PROVIDERS[2]!.profileId;
export const SEED_CORE_ZERO_REVIEW_DISPLAY_NAME = PROVIDERS[2]!.displayName;
