import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { getOwnedProfileDashboard } from '$lib/server/modules/provider-profile';
import {
	resubmitVerificationClaim,
	submitVerificationClaim
} from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'provider';

const SubmitSchema = z.object({
	docPhotoIds: z.array(z.string().uuid()).length(2)
});

export function createVerificationSubmitHandler(mode: 'submit' | 'resubmit'): RequestHandler {
	return async ({ request, locals }) => {
		if (!locals.auth.userId) {
			return json(
				{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
				{ status: 401 }
			);
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json(
				{
					error: {
						code: 'VALIDATION_FAILED',
						message: 'Invalid JSON.',
						fields: null
					}
				},
				{ status: 422 }
			);
		}

		const parsed = SubmitSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					error: {
						code: 'VALIDATION_FAILED',
						message: 'Please fix the highlighted fields.',
						fields: parsed.error.issues.map((issue) => ({
							path: issue.path.join('.') || 'body',
							message: issue.message
						}))
					}
				},
				{ status: 422 }
			);
		}

		const db = getDb();
		const now = new Date();
		const limited = await consumeRateLimit(
			db,
			bucketSpec('verification_submit'),
			`account:${locals.auth.userId}`,
			now
		);
		if (!limited.ok) {
			const mapped = useCaseErrorToHttp(limited.error);
			return json(mapped.body, { status: mapped.status });
		}

		const dashboard = await getOwnedProfileDashboard(db, locals.auth.userId);
		if (!dashboard) {
			return json(
				{
					error: {
						code: 'NOT_FOUND',
						message: 'We could not find your provider profile.',
						fields: null
					}
				},
				{ status: 404 }
			);
		}

		const input = {
			ownerId: locals.auth.userId,
			providerProfileId: dashboard.profileId,
			docPhotoIds: parsed.data.docPhotoIds,
			now
		};

		const result =
			mode === 'submit'
				? await submitVerificationClaim(db, input)
				: await resubmitVerificationClaim(db, input);

		if (!result.ok) {
			const mapped = useCaseErrorToHttp(result.error);
			return json(mapped.body, { status: mapped.status });
		}

		return json(success(result.value), { status: 201 });
	};
}
