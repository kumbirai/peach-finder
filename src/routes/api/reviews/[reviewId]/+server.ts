import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId, type ReviewId } from '$lib/server/shared/ids';
import { deleteReview, editReview } from '$lib/server/modules/provider-reviews';

export const _requiredRole: Role = 'seeker';

const EditReviewSchema = z
	.object({
		rating: z.number().int().min(1).max(5).optional(),
		body: z.string().max(1000).nullable().optional()
	})
	.refine((value) => value.rating !== undefined || value.body !== undefined, {
		message: 'Provide a rating or review text to update.'
	});

function parseReviewId(raw: string): ReviewId | null {
	try {
		return asId<'ReviewId'>(raw);
	} catch {
		return null;
	}
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	const reviewId = parseReviewId(params.reviewId!);
	if (!reviewId) {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'We could not find that.', fields: null } },
			{ status: 404 }
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

	const parsed = EditReviewSchema.safeParse(body);
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
		bucketSpec('review_submit'),
		`account:${locals.auth.userId}`,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const result = await editReview(db, {
		reviewId,
		seekerId: locals.auth.userId,
		...(parsed.data.rating !== undefined ? { rating: parsed.data.rating } : {}),
		...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
		now,
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	const reviewId = parseReviewId(params.reviewId!);
	if (!reviewId) {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'We could not find that.', fields: null } },
			{ status: 404 }
		);
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

	const result = await deleteReview(db, {
		reviewId,
		seekerId: locals.auth.userId,
		now,
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
