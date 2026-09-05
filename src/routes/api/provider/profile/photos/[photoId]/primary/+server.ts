import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId, type PhotoId } from '$lib/server/shared/ids';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { setPrimaryProfilePhoto, loadOwnerProfile } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

export const PUT: RequestHandler = async ({ params, locals }) => {
	let photoId: PhotoId;
	try {
		photoId = asId<'PhotoId'>(params.photoId!);
	} catch {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'We could not find that.', fields: null } },
			{ status: 404 }
		);
	}

	const db = getDb();
	const result = await setPrimaryProfilePhoto(
		db,
		locals.auth.userId!,
		photoId,
		crypto.randomUUID(),
		new Date()
	);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	return json(success(profile));
};
