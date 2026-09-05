import type { RequestHandler } from '@sveltejs/kit';
import { readLocalMediaFile } from '$lib/server/modules/media-processing';

export const GET: RequestHandler = async ({ params }) => {
	const path = params.path ?? '';
	if (!path || path.includes('..')) {
		return new Response('Not found', { status: 404 });
	}

	const bytes = await readLocalMediaFile(path);
	if (!bytes) {
		return new Response('Not found', { status: 404 });
	}

	const ext = path.split('.').pop()?.toLowerCase();
	const contentType =
		ext === 'webp'
			? 'image/webp'
			: ext === 'jpg' || ext === 'jpeg'
				? 'image/jpeg'
				: 'application/octet-stream';

	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
