import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { fileReport } from '$lib/server/modules/trust-and-safety';
import {
	REPORT_REASONS,
	REPORT_TARGET_TYPES
} from '$lib/server/modules/trust-and-safety/domain/report-taxonomy';

export const _requiredRole: Role = 'seeker';

const FileReportSchema = z.object({
	targetType: z.enum(REPORT_TARGET_TYPES),
	targetId: z.string().uuid(),
	reason: z.enum(REPORT_REASONS),
	freeText: z.string().max(2000).optional()
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

	const parsed = FileReportSchema.safeParse(body);
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
		bucketSpec('report_file'),
		`account:${locals.auth.userId}`,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const result = await fileReport(db, {
		reporterId: locals.auth.userId,
		targetType: parsed.data.targetType,
		targetId: parsed.data.targetId,
		reason: parsed.data.reason,
		freeText: parsed.data.freeText ?? null,
		now,
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success({ reportId: result.value.reportId }), { status: 201 });
};
