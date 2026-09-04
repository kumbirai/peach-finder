import { boolean, integer, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const discoverySearchSchema = pgSchema('discovery_search');

export const searchProjection = discoverySearchSchema.table('search_projection', {
	providerProfileId: uuid('provider_profile_id').primaryKey(),
	ownerId: uuid('owner_id').notNull(),
	displayName: text('display_name').notNull(),
	searchText: text('search_text').notNull().default(''),
	serviceTagIds: uuid('service_tag_ids').array().notNull().default([]),
	languageCodes: text('language_codes').array().notNull().default([]),
	areaId: uuid('area_id').notNull(),
	priceMinCents: integer('price_min_cents'),
	priceMaxCents: integer('price_max_cents'),
	availabilityState: text('availability_state').notNull().default('not_available'),
	availabilitySetAt: timestamp('availability_set_at', { withTimezone: true, mode: 'date' }),
	ratingAverage: numeric('rating_average', { precision: 2, scale: 1 }),
	ratingCount: integer('rating_count').notNull().default(0),
	badgeIdentityVerified: boolean('badge_identity_verified').notNull().default(false),
	badgeActiveThisWeek: boolean('badge_active_this_week').notNull().default(false),
	isFeatured: boolean('is_featured').notNull().default(false),
	featuredSince: timestamp('featured_since', { withTimezone: true, mode: 'date' }),
	lastActivityAt: timestamp('last_activity_at', { withTimezone: true, mode: 'date' }),
	photoPrimaryUrl: text('photo_primary_url'),
	publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const blockedPair = discoverySearchSchema.table(
	'blocked_pair',
	{
		blockerId: uuid('blocker_id').notNull(),
		blockedId: uuid('blocked_id').notNull()
	},
	(table) => [{ pk: { columns: [table.blockerId, table.blockedId] } }]
);

export const suggestTerm = discoverySearchSchema.table(
	'suggest_term',
	{
		term: text('term').notNull(),
		kind: text('kind').notNull(),
		isActive: boolean('is_active').notNull().default(true)
	},
	(table) => [{ pk: { columns: [table.term, table.kind] } }]
);
