import { json, type RequestHandler } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { zId } from '$lib/server/shared/zod';
import { queryRows } from '$lib/server/shared/sql-result';
import { photos } from '$lib/server/modules/media-processing/infra/schema';
import { verificationCases } from '$lib/server/modules/trust-and-safety/infra/schema';
import { threads } from '$lib/server/modules/direct-messaging/infra/schema';
import { SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	scenario: z.enum(['identity-doc', 'dormant-thread', 'analytics']),
	caseId: zId<'VerificationCaseId'>().optional(),
	photoId: zId<'PhotoId'>().optional(),
	seekerId: zId<'UserId'>().optional(),
	threadId: zId<'ThreadId'>().optional()
});

/** Dev-only: verify US-PRIV-03 retention fixture outcomes after retention-tick. */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const parsed = BodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const db = getDb();

	if (parsed.data.scenario === 'identity-doc') {
		if (!parsed.data.caseId || !parsed.data.photoId) {
			return json({ error: 'caseId and photoId required' }, { status: 422 });
		}

		const caseRow = await db
			.select({
				status: verificationCases.status,
				decidedAt: verificationCases.decidedAt,
				decidedBy: verificationCases.decidedBy,
				docsPurgedAt: verificationCases.docsPurgedAt
			})
			.from(verificationCases)
			.where(eq(verificationCases.id, parsed.data.caseId))
			.limit(1);

		const photoRows = await db.select().from(photos).where(eq(photos.id, parsed.data.photoId));

		return json({
			data: {
				metadataRetained:
					caseRow[0]?.status != null &&
					caseRow[0]?.decidedAt != null &&
					caseRow[0]?.decidedBy != null,
				docsPurgedAt: caseRow[0]?.docsPurgedAt?.toISOString() ?? null,
				photoRemoved: photoRows.length === 0
			}
		});
	}

	if (parsed.data.scenario === 'dormant-thread') {
		if (!parsed.data.seekerId) {
			return json({ error: 'seekerId required' }, { status: 422 });
		}

		const threadRows = await db
			.select({ id: threads.id })
			.from(threads)
			.where(eq(threads.seekerId, parsed.data.seekerId));

		return json({
			data: {
				threadPurged: threadRows.length === 0,
				threadsRemaining: threadRows.length
			}
		});
	}

	const profileId = SEED_DUAL_ROLE_PROFILE_ID;
	const remaining = await db.execute(sql`
		SELECT COUNT(*)::int AS count
		FROM provider_analytics.raw_event
		WHERE provider_profile_id = ${profileId}::uuid
	`);
	const rollup = await db.execute(sql`
		SELECT COALESCE(SUM(profile_views), 0)::int AS profile_views
		FROM provider_analytics.hourly_rollup
		WHERE provider_profile_id = ${profileId}::uuid
	`);

	return json({
		data: {
			rawEventsRemaining: Number(queryRows(remaining)[0]?.count ?? 0),
			rollupProfileViews: Number(queryRows(rollup)[0]?.profile_views ?? 0)
		}
	});
};
