import { boolean, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const providerProfileSchema = pgSchema('provider_profile');

export const serviceTags = providerProfileSchema.table('service_tag', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const providerProfiles = providerProfileSchema.table('provider_profile', {
	id: uuid('id').primaryKey(),
	ownerId: uuid('owner_id').notNull().unique(),
	areaId: uuid('area_id'),
	intro: text('intro'),
	publishState: text('publish_state').notNull().default('draft'),
	unpublishReason: text('unpublish_reason'),
	phoneVisible: boolean('phone_visible').notNull().default(false),
	firstPublishedAt: timestamp('first_published_at', { withTimezone: true, mode: 'date' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const services = providerProfileSchema.table('service', {
	id: uuid('id').primaryKey(),
	providerProfileId: uuid('provider_profile_id')
		.notNull()
		.references(() => providerProfiles.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	durationMinutes: integer('duration_minutes').notNull(),
	priceCents: integer('price_cents').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const providerServiceTags = providerProfileSchema.table(
	'provider_service_tag',
	{
		providerProfileId: uuid('provider_profile_id')
			.notNull()
			.references(() => providerProfiles.id, { onDelete: 'cascade' }),
		serviceTagId: uuid('service_tag_id')
			.notNull()
			.references(() => serviceTags.id)
	},
	(table) => [{ pk: { columns: [table.providerProfileId, table.serviceTagId] } }]
);

export const languages = providerProfileSchema.table('language', {
	code: text('code').primaryKey(),
	name: text('name').notNull(),
	isActive: boolean('is_active').notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const providerLanguages = providerProfileSchema.table(
	'provider_language',
	{
		providerProfileId: uuid('provider_profile_id')
			.notNull()
			.references(() => providerProfiles.id, { onDelete: 'cascade' }),
		languageCode: text('language_code')
			.notNull()
			.references(() => languages.code)
	},
	(table) => [{ pk: { columns: [table.providerProfileId, table.languageCode] } }]
);

export const providerPhotos = providerProfileSchema.table('provider_photo', {
	id: uuid('id').primaryKey(),
	providerProfileId: uuid('provider_profile_id')
		.notNull()
		.references(() => providerProfiles.id, { onDelete: 'cascade' }),
	photoId: uuid('photo_id').notNull(),
	status: text('status').notNull().default('pending'),
	sortOrder: integer('sort_order').notNull().default(0),
	isPrimary: boolean('is_primary').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
