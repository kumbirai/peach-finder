import { boolean, integer, numeric, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const providerReviewsSchema = pgSchema('provider_reviews');

export const ratingAggregate = providerReviewsSchema.table('rating_aggregate', {
	providerProfileId: uuid('provider_profile_id').primaryKey(),
	average: numeric('average', { precision: 2, scale: 1 }),
	count: integer('count').notNull().default(0),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const reviews = providerReviewsSchema.table('review', {
	id: uuid('id').primaryKey(),
	providerProfileId: uuid('provider_profile_id').notNull(),
	reviewerId: uuid('reviewer_id').notNull(),
	rating: smallint('rating').notNull(),
	body: text('body'),
	isEdited: boolean('is_edited').notNull().default(false),
	editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
	replyBody: text('reply_body'),
	repliedAt: timestamp('replied_at', { withTimezone: true, mode: 'date' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
