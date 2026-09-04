import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDevVerificationToken } from '$lib/server/modules/identity-and-access';

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
	const token = getDevVerificationToken(body.data.email);
	if (!token) {
		return json({ error: 'No token' }, { status: 404 });
	}
	return json({ data: { token } });
};
