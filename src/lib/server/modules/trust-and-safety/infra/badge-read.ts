import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { badgeState } from './schema';

export type BadgeDisplayState = {
	identityVerified: boolean;
	activeThisWeek: boolean;
	suppressed: boolean;
	suppressedReason: string | null;
};

export async function loadBadgeDisplayState(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<BadgeDisplayState> {
	const rows = await db
		.select({
			identityVerified: badgeState.identityVerified,
			suppressed: badgeState.suppressed,
			suppressedReason: badgeState.suppressedReason,
			activeThisWeek: badgeState.activeThisWeek
		})
		.from(badgeState)
		.where(eq(badgeState.providerProfileId, providerProfileId))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return {
			identityVerified: false,
			activeThisWeek: false,
			suppressed: false,
			suppressedReason: null
		};
	}

	return {
		identityVerified: row.identityVerified && !row.suppressed,
		activeThisWeek: row.activeThisWeek,
		suppressed: row.suppressed,
		suppressedReason: row.suppressedReason
	};
}

export async function loadOwnerBadgeNotice(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<{ suppressed: boolean; message: string | null }> {
	const rows = await db
		.select({
			suppressed: badgeState.suppressed,
			suppressedReason: badgeState.suppressedReason,
			identityVerified: badgeState.identityVerified
		})
		.from(badgeState)
		.where(eq(badgeState.providerProfileId, providerProfileId))
		.limit(1);

	const row = rows[0];
	if (!row?.suppressed || !row.identityVerified) {
		return { suppressed: false, message: null };
	}

	return {
		suppressed: true,
		message:
			row.suppressedReason ??
			'Your Identity verified badge is hidden while we quickly re-check your updated details. Your profile stays live.'
	};
}
