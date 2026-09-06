import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { actOnReport } from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'admin';

const bodySchema = z.object({
	action: z.literal('unpublish'),
	reason: z.string().trim().min(1).max(2000)
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const reportId = asId<'ReportId'>(params.reportId!);
	const result = await actOnReport(getDb(), {
		reportId,
		adminId: locals.auth.userId!,
		action: parsed.data.action,
		reason: parsed.data.reason,
		idempotencyKey: request.headers.get('Idempotency-Key'),
		correlationId: locals.correlationId,
		now: new Date()
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
