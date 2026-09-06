import type { RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	readIdentityDocBytes,
	verifyIdentityDocPresign
} from '$lib/server/modules/media-processing';
import type { Role } from '$lib/server/shared/auth-context';
import { asId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ params, url }) => {
	const photoId = asId<'PhotoId'>(params.photoId!);
	const expiresAtMs = Number(url.searchParams.get('exp'));
	const signature = url.searchParams.get('sig') ?? '';
	const now = new Date();

	if (!verifyIdentityDocPresign(photoId, expiresAtMs, signature, now)) {
		return new Response('Link expired or invalid', { status: 403 });
	}

	const bytes = await readIdentityDocBytes(getDb(), photoId);
	if (!bytes) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'private, no-store'
		}
	});
};
