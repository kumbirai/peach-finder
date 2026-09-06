import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { anonymousAuth } from '../../../shared/auth-context';
import type { ProviderProfileId, VerificationCaseId } from '../../../shared/ids';
import { getPublicProfile } from '../../provider-profile';
import type { PublicProfile } from '../../provider-profile/infra/serializers';
import { formatQueueAge, isQueueAgeOverdue, queueAgeHours } from '../domain/queue-age';
import { verificationCases } from './schema';

export type IdentityQueueItem = {
	caseId: VerificationCaseId;
	providerProfileId: ProviderProfileId;
	displayName: string;
	submittedAt: string;
	queueAgeLabel: string;
	overdue: boolean;
	docPhotoIds: string[];
	docKinds: string[];
	profile: PublicProfile;
};

export type IdentityQueueStats = {
	pendingCount: number;
	avgAgeHours: number | null;
	maxAgeHours: number | null;
};

export async function listIdentityQueue(db: Database, now: Date): Promise<IdentityQueueItem[]> {
	const rows = await db
		.select()
		.from(verificationCases)
		.where(eq(verificationCases.status, 'pending'))
		.orderBy(asc(verificationCases.submittedAt));

	const items: IdentityQueueItem[] = [];
	for (const row of rows) {
		const profileResult = await getPublicProfile(
			db,
			row.providerProfileId as ProviderProfileId,
			anonymousAuth('127.0.0.1'),
			{ requirePublished: false }
		);
		if (!profileResult.ok) continue;

		const submittedAt = row.submittedAt;
		items.push({
			caseId: row.id as VerificationCaseId,
			providerProfileId: row.providerProfileId as ProviderProfileId,
			displayName: profileResult.value.displayName,
			submittedAt: submittedAt.toISOString(),
			queueAgeLabel: formatQueueAge(submittedAt, now),
			overdue: isQueueAgeOverdue(submittedAt, now),
			docPhotoIds: row.docPhotoIds ?? [],
			docKinds: (row.docPhotoIds ?? []).map((_, index) => (index === 0 ? 'id' : 'selfie')),
			profile: profileResult.value
		});
	}
	return items;
}

export async function getIdentityQueueStats(db: Database, now: Date): Promise<IdentityQueueStats> {
	const rows = await db
		.select({ submittedAt: verificationCases.submittedAt })
		.from(verificationCases)
		.where(eq(verificationCases.status, 'pending'));

	if (rows.length === 0) {
		return { pendingCount: 0, avgAgeHours: null, maxAgeHours: null };
	}

	const ages = rows.map((row) => queueAgeHours(row.submittedAt, now));
	const total = ages.reduce((sum, age) => sum + age, 0);
	return {
		pendingCount: rows.length,
		avgAgeHours: total / rows.length,
		maxAgeHours: Math.max(...ages)
	};
}

export async function findPendingVerificationCase(
	db: Database,
	caseId: VerificationCaseId
): Promise<typeof verificationCases.$inferSelect | null> {
	const rows = await db
		.select()
		.from(verificationCases)
		.where(and(eq(verificationCases.id, caseId), eq(verificationCases.status, 'pending')))
		.limit(1);
	return rows[0] ?? null;
}
