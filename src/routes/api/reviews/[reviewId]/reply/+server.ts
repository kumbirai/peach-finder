import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId, type ReviewId } from '$lib/server/shared/ids';
import { editReviewReply, replyToReview } from '$lib/server/modules/provider-reviews';

export const _requiredRole: Role = 'provider';

const ReplySchema = z.object({
	body: z.string().min(1).max(1000)
});

function parseReviewId(raw: string): ReviewId | null {
	try {
		return asId<'ReviewId'>(raw);
	} catch {
		return null;
	}
}

async function parseBody(
	request: Request
): Promise<{ ok: true; body: string } | { ok: false; response: ReturnType<typeof json> }> {
	try {
		const raw = await request.json();
		const parsed = ReplySchema.safeParse(raw);
		if (!parsed.success) {
			return {
				ok: false,
				response: json(
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
				)
			};
		}
		return { ok: true, body: parsed.data.body };
	} catch {
		return {
			ok: false,
			response: json(
				{
					error: {
						code: 'VALIDATION_FAILED',
						message: 'Invalid JSON.',
						fields: null
					}
				},
				{ status: 422 }
			)
		};
	}
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
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

	const parsed = await parseBody(request);
	if (!parsed.ok) {
		return parsed.response;
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

	const result = await replyToReview(db, {
		reviewId,
		providerOwnerId: locals.auth.userId,
		body: parsed.body,
		now,
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};

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

	const parsed = await parseBody(request);
	if (!parsed.ok) {
		return parsed.response;
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

	const result = await editReviewReply(db, {
		reviewId,
		providerOwnerId: locals.auth.userId,
		body: parsed.body,
		now
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
