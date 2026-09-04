import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDevOtpCode } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({ otpId: z.string().uuid() });

export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}
	const body = BodySchema.safeParse(await request.json());
	if (!body.success) {
		return json({ error: 'Invalid otpId' }, { status: 422 });
	}
	const code = getDevOtpCode(body.data.otpId);
	if (!code) {
		return json({ error: 'No code' }, { status: 404 });
	}
	return json({ data: { code } });
};
