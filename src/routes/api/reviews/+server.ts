import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { zId } from '$lib/server/shared/zod';
import { parseProviderProfileId, submitReview } from '$lib/server/modules/provider-reviews';

export const _requiredRole: Role = 'seeker';

const SubmitReviewSchema = z.object({
	providerProfileId: zId<'ProviderProfileId'>(),
	rating: z.number().int().min(1).max(5),
	body: z.string().max(1000).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
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

	const parsed = SubmitReviewSchema.safeParse(body);
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

	const profileParsed = parseProviderProfileId(parsed.data.providerProfileId);
	if (!profileParsed.ok) {
		const mapped = useCaseErrorToHttp(profileParsed.error);
		return json(mapped.body, { status: mapped.status });
	}

	const db = getDb();
	const now = new Date();
	const limited = await consumeRateLimit(
		db,
		bucketSpec('review_submit'),
		`account:${locals.auth.userId}`,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const result = await submitReview(db, {
		seekerId: locals.auth.userId,
		providerProfileId: profileParsed.value,
		rating: parsed.data.rating,
		body: parsed.data.body ?? null,
		now,
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value), { status: 201 });
};
