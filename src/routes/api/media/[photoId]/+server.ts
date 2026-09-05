import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId, type PhotoId } from '$lib/server/shared/ids';
import { useCaseErrorToHttp } from '$lib/server/shared/api';
import { removeMediaPhoto } from '$lib/server/modules/media-processing';

export const _requiredRole: Role = 'provider';

export const DELETE: RequestHandler = async ({ params }) => {
	let photoId: PhotoId;
	try {
		photoId = asId<'PhotoId'>(params.photoId!);
	} catch {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'We could not find that.', fields: null } },
			{ status: 404 }
		);
	}

	const result = await removeMediaPhoto(getDb(), photoId, crypto.randomUUID());
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return new Response(null, { status: 204 });
};
