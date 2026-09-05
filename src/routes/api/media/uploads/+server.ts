import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { uploadProfilePhoto } from '$lib/server/modules/media-processing';
import { getGalleryReadyCount } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const file = form.get('file');
	const scope = String(form.get('scope') ?? 'profile_photo');

	if (!(file instanceof File)) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Choose an image to upload.',
					fields: [{ path: 'file', message: 'Choose an image to upload.' }]
				}
			},
			{ status: 422 }
		);
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	const db = getDb();
	const userId = locals.auth.userId!;
	const readyCount = scope === 'profile_photo' ? await getGalleryReadyCount(db, userId) : 0;

	const result = await uploadProfilePhoto(
		db,
		userId,
		bytes,
		scope === 'profile_photo' ? 'profile_photo' : 'message_attachment',
		readyCount,
		crypto.randomUUID(),
		new Date()
	);

	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, {
			status: status === 422 && result.error.kind === 'validation_failed' ? 422 : status
		});
	}

	return json(success(result.value), { status: 202 });
};
