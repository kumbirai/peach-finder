import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { probeIdentityDocsAnonymousDenial } from '$lib/server/modules/media-processing/infra/identity-doc-store-probe';

export const _requiredRole: Role = 'anonymous';

export const POST: RequestHandler = async () => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}
	const probe = await probeIdentityDocsAnonymousDenial();
	return json({ data: probe });
};
