import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const listingBillingSchema = pgSchema('listing_billing');

export const listings = listingBillingSchema.table('listing', {
	providerProfileId: uuid('provider_profile_id').primaryKey(),
	state: text('state').notNull().default('building'),
	trialStartedAt: timestamp('trial_started_at', { withTimezone: true, mode: 'date' }),
	trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
