import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { issueIdentityDocUrl } from '$lib/server/modules/media-processing';
import { verificationCaseReferencesPhoto } from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId, type PhotoId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async ({ params, locals }) => {
	const photoId = asId<'PhotoId'>(params.photoId!);
	const referenced = await verificationCaseReferencesPhoto(getDb(), photoId);
	if (!referenced) {
		return json(
			{
				error: {
					code: 'NOT_FOUND',
					message: 'We could not find that.',
					fields: null
				}
			},
			{ status: 404 }
		);
	}

	const result = await issueIdentityDocUrl(getDb(), {
		photoId,
		adminId: locals.auth.userId!,
		correlationId: locals.correlationId,
		now: new Date()
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
