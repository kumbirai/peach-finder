import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { storeIdentityDoc } from '$lib/server/modules/media-processing';

export const _requiredRole: Role = 'provider';

const DocKindSchema = z.enum(['id', 'selfie']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	const form = await request.formData();
	const file = form.get('file');
	const docKind = DocKindSchema.safeParse(String(form.get('docKind') ?? ''));

	if (!docKind.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [{ path: 'docKind', message: 'Choose whether this is your ID or selfie.' }]
				}
			},
			{ status: 422 }
		);
	}

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
	const result = await storeIdentityDoc(db, locals.auth.userId, bytes, new Date());

	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return json(success({ photoId: result.value.photoId, docKind: docKind.data }), { status: 201 });
};
