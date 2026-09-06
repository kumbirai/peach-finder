import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import sharp from 'sharp';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId, newId, type ProviderProfileId, type UserId } from '$lib/server/shared/ids';
import {
	SEED_ADMIN_USER_ID,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../../../../scripts/seed-core';
import {
	SEED_VERIF_PENDING_OLD_OWNER_ID,
	SEED_VERIF_PENDING_OLD_PROFILE_ID
} from '../../../../../scripts/seed-verification-constants';
import { storeIdentityDoc } from '$lib/server/modules/media-processing';
import { IDENTITY_DOC_RETENTION_MS } from '$lib/server/modules/trust-and-safety/domain/identity-doc-retention';
import { verificationCases } from '$lib/server/modules/trust-and-safety/infra/schema';
import { sendOrHoldMessage } from '$lib/server/modules/direct-messaging/infra/messaging-commands';
import { DORMANT_THREAD_MONTHS } from '$lib/server/modules/direct-messaging/domain/dormant-thread-retention';
import { users } from '$lib/server/modules/identity-and-access/infra/schema';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	scenario: z.enum(['identity-doc', 'dormant-thread', 'analytics']),
	now: z.string().datetime().optional()
});

async function identityDocFixture(label: string): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">
		<rect width="100%" height="100%" fill="#f5f0eb"/>
		<text x="8" y="24" font-family="sans-serif" font-size="12">${label}</text>
	</svg>`;
	return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

function monthsAgo(now: Date, months: number): Date {
	const value = new Date(now);
	value.setUTCMonth(value.getUTCMonth() - months);
	return value;
}

/** Dev-only: seed US-PRIV-03 retention fixtures at boundary ages. */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const parsed = BodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const now = parsed.data.now ? new Date(parsed.data.now) : new Date();
	const db = getDb();
	process.env.MEDIA_LOCAL_ROOT ??= `/tmp/peach-retention-${Date.now()}`;

	if (parsed.data.scenario === 'identity-doc') {
		const ownerId = asId<'UserId'>(SEED_VERIF_PENDING_OLD_OWNER_ID);
		const profileId = asId<'ProviderProfileId'>(SEED_VERIF_PENDING_OLD_PROFILE_ID);
		const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
		const decidedAt = new Date(now.getTime() - IDENTITY_DOC_RETENTION_MS);
		const caseId = newId<'VerificationCaseId'>();

		const idStored = await storeIdentityDoc(
			db,
			ownerId,
			await identityDocFixture('e2e-id'),
			decidedAt
		);
		if (!idStored.ok) {
			return json({ error: 'Failed to store identity doc' }, { status: 500 });
		}

		await db.insert(verificationCases).values({
			id: caseId,
			providerProfileId: profileId,
			status: 'approved',
			docPhotoIds: [idStored.value.photoId],
			submittedAt: decidedAt,
			decidedAt,
			decidedBy: adminId,
			decisionReason: 'e2e retention fixture'
		});

		return json({
			data: {
				scenario: 'identity-doc',
				caseId,
				photoId: idStored.value.photoId,
				decidedAt: decidedAt.toISOString()
			}
		});
	}

	if (parsed.data.scenario === 'dormant-thread') {
		const seekerId = asId<'UserId'>('01900000-0000-7000-8000-000000009901');
		await db
			.insert(users)
			.values({
				id: seekerId,
				displayName: 'Retention Dormant Seeker',
				email: 'retention-dormant@example.com',
				emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
				status: 'active'
			})
			.onConflictDoNothing();

		const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
		const dormantAt = monthsAgo(now, DORMANT_THREAD_MONTHS);
		const sent = await sendOrHoldMessage(db, {
			seekerId,
			providerProfileId,
			body: 'E2E dormant thread fixture',
			now: dormantAt,
			correlationId: 'e2e-retention-dormant'
		});
		if (!sent.ok || sent.value.kind !== 'sent') {
			return json({ error: 'Failed to seed dormant thread' }, { status: 500 });
		}

		return json({
			data: {
				scenario: 'dormant-thread',
				seekerId,
				threadId: sent.value.threadId,
				lastActivityAt: dormantAt.toISOString()
			}
		});
	}

	const profileId = SEED_DUAL_ROLE_PROFILE_ID;
	const at90 = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
	const at89 = new Date(now.getTime() - 89 * 24 * 60 * 60_000);

	await db.execute(sql`
		DELETE FROM provider_analytics.raw_event
		WHERE provider_profile_id = ${profileId}::uuid
	`);
	await db.execute(sql`
		INSERT INTO provider_analytics.raw_event (
			id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
		) VALUES
			(gen_random_uuid(), 'profile_view', ${profileId}::uuid, 'viewer-old', ${at90.toISOString()}::timestamptz, '{}'::jsonb),
			(gen_random_uuid(), 'profile_view', ${profileId}::uuid, 'viewer-new', ${at89.toISOString()}::timestamptz, '{}'::jsonb)
	`);
	await db.execute(sql`
		INSERT INTO provider_analytics.hourly_rollup (
			provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
		) VALUES (
			${profileId}::uuid, date_trunc('hour', ${at90.toISOString()}::timestamptz), 5, 0, 0
		)
		ON CONFLICT (provider_profile_id, hour_bucket) DO UPDATE
		SET profile_views = EXCLUDED.profile_views
	`);

	return json({
		data: {
			scenario: 'analytics',
			providerProfileId: profileId,
			oldEventAt: at90.toISOString(),
			newEventAt: at89.toISOString()
		}
	});
};
