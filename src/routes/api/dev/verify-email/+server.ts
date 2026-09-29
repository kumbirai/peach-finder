import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { devVerifyEmailByAddress } from '$lib/server/modules/identity-and-access';
import { releaseHeldMessagesForUser } from '$lib/server/modules/direct-messaging';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({ email: z.string().email() });

export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}
	const body = BodySchema.safeParse(await request.json());
	if (!body.success) {
		return json({ error: 'Invalid email' }, { status: 422 });
	}

	const email = body.data.email.trim().toLowerCase();
	const db = getDb();
	const now = new Date();
	const result = await devVerifyEmailByAddress(db, email, now, crypto.randomUUID());
	if (!result.ok) {
		if (result.error.kind === 'not_found') {
			return json({ error: 'No user' }, { status: 404 });
		}
		return json({ error: 'Verification failed' }, { status: 422 });
	}

	if (!result.value.alreadyVerified) {
		await releaseHeldMessagesForUser(db, result.value.userId, now, crypto.randomUUID());
	}

	return json({
		data: {
			verified: true,
			userId: result.value.userId,
			alreadyVerified: result.value.alreadyVerified
		}
	});
};
