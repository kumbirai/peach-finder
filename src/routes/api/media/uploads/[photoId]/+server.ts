import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId, type PhotoId } from '$lib/server/shared/ids';
import { success } from '$lib/server/shared/api';
import { getPhotoUploadStatus } from '$lib/server/modules/media-processing';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ params, locals }) => {
	let photoId: PhotoId;
	try {
		photoId = asId<'PhotoId'>(params.photoId!);
	} catch {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'We could not find that.', fields: null } },
			{ status: 404 }
		);
	}

	const status = await getPhotoUploadStatus(getDb(), photoId, locals.auth.userId!);
	if (!status) {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'We could not find that.', fields: null } },
			{ status: 404 }
		);
	}

	return json(success(status));
};
