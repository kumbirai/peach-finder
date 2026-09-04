import {
	boolean,
	doublePrecision,
	index,
	jsonb,
	pgSchema,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

export const platformSchema = pgSchema('platform_configuration');

export const areas = platformSchema.table(
	'area',
	{
		id: uuid('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		parentAreaId: uuid('parent_area_id'),
		centroidLat: doublePrecision('centroid_lat').notNull(),
		centroidLng: doublePrecision('centroid_lng').notNull(),
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [index('area_parent_idx').on(table.parentAreaId)]
);

export const config = platformSchema.table('config', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	updatedBy: uuid('updated_by')
});

export const lexiconEntries = platformSchema.table(
	'lexicon_entry',
	{
		id: uuid('id').primaryKey(),
		term: text('term').notNull(),
		entryType: text('entry_type').notNull(),
		mapsTo: jsonb('maps_to').notNull(),
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [uniqueIndex('lexicon_term_type_uq').on(table.term, table.entryType)]
);
