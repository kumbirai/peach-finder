import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const trustAndSafetySchema = pgSchema('trust_and_safety');

export const providerBadges = trustAndSafetySchema.table(
	'provider_badge',
	{
		providerProfileId: uuid('provider_profile_id').notNull(),
		badge: text('badge').notNull(),
		grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [{ pk: { columns: [table.providerProfileId, table.badge] } }]
);
