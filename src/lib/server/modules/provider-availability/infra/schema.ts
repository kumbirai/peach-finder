import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const providerAvailabilitySchema = pgSchema('provider_availability');

export const availability = providerAvailabilitySchema.table('availability', {
	providerProfileId: uuid('provider_profile_id').primaryKey(),
	state: text('state').notNull().default('not_available'),
	setAt: timestamp('set_at', { withTimezone: true, mode: 'date' }),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
