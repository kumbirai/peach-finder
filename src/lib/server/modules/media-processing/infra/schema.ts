import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const mediaProcessingSchema = pgSchema('media_processing');

export const photos = mediaProcessingSchema.table('photo', {
	id: uuid('id').primaryKey(),
	ownerId: uuid('owner_id').notNull(),
	status: text('status').notNull().default('ready'),
	cardUrl: text('card_url').notNull(),
	galleryUrl: text('gallery_url').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
