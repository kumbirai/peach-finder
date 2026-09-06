import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import type { VerificationOwnerView } from '../domain/verification-status';
import { badgeState, verificationCases } from './schema';

export async function getOwnVerificationStatus(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<VerificationOwnerView> {
	const pendingRows = await db
		.select()
		.from(verificationCases)
		.where(
			and(
				eq(verificationCases.providerProfileId, providerProfileId),
				eq(verificationCases.status, 'pending')
			)
		)
		.limit(1);

	const pending = pendingRows[0];
	if (pending) {
		return {
			status: 'pending',
			submittedAt: pending.submittedAt.toISOString(),
			decidedAt: null,
			rejectionReason: null,
			caseId: pending.id
		};
	}

	const badgeRows = await db
		.select({
			identityVerified: badgeState.identityVerified,
			suppressed: badgeState.suppressed,
			identityVerifiedSince: badgeState.identityVerifiedSince
		})
		.from(badgeState)
		.where(eq(badgeState.providerProfileId, providerProfileId))
		.limit(1);

	const badge = badgeRows[0];
	if (badge?.identityVerified && !badge.suppressed) {
		return {
			status: 'approved',
			submittedAt: null,
			decidedAt: badge.identityVerifiedSince?.toISOString() ?? null,
			rejectionReason: null,
			caseId: null
		};
	}

	const decidedRows = await db
		.select()
		.from(verificationCases)
		.where(eq(verificationCases.providerProfileId, providerProfileId))
		.orderBy(desc(verificationCases.decidedAt))
		.limit(1);

	const latest = decidedRows[0];
	if (latest?.status === 'rejected') {
		return {
			status: 'rejected',
			submittedAt: latest.submittedAt.toISOString(),
			decidedAt: latest.decidedAt?.toISOString() ?? null,
			rejectionReason: latest.decisionReason,
			caseId: latest.id
		};
	}

	if (latest?.status === 'approved') {
		return {
			status: 'approved',
			submittedAt: latest.submittedAt.toISOString(),
			decidedAt: latest.decidedAt?.toISOString() ?? null,
			rejectionReason: null,
			caseId: latest.id
		};
	}

	return {
		status: 'never_submitted',
		submittedAt: null,
		decidedAt: null,
		rejectionReason: null,
		caseId: null
	};
}
