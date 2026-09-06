import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { seedReviews } from '../../../../../scripts/seed-reviews';

export const _requiredRole: Role = 'anonymous';

/** Dev-only: reset US-REV-01 review fixtures for idempotent Playwright runs. */
export const POST: RequestHandler = async () => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const db = getDb();
	await seedReviews(db);

	return json({ data: { reseeded: true } });
};
