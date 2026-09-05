import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { badgeState, providerBadges } from './schema';

export async function grantIdentityBadgeDev(
	db: Database,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<void> {
	await db
		.insert(providerBadges)
		.values({ providerProfileId, badge: 'identity_verified' })
		.onConflictDoNothing();
	await db
		.insert(badgeState)
		.values({
			providerProfileId,
			identityVerified: true,
			identityVerifiedSince: now,
			suppressed: false,
			activeThisWeek: false,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: badgeState.providerProfileId,
			set: {
				identityVerified: true,
				identityVerifiedSince: now,
				suppressed: false,
				suppressedReason: null,
				updatedAt: now
			}
		});

	await db
		.update(badgeState)
		.set({ suppressed: false, suppressedReason: null, updatedAt: now })
		.where(eq(badgeState.providerProfileId, providerProfileId));
}
