import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import {
	isValidAuditCursor,
	readAuditLog,
	type ReadAuditLogOptions
} from '$lib/server/modules/platform-configuration';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

const QuerySchema = z.object({
	targetType: z.string().trim().min(1),
	targetId: z.string().uuid(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(50).optional()
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = QuerySchema.safeParse({
		targetType: url.searchParams.get('targetType') ?? '',
		targetId: url.searchParams.get('targetId') ?? '',
		cursor: url.searchParams.get('cursor') ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined
	});
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'targetType and targetId are required.',
					fields: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.') || 'query',
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const options: ReadAuditLogOptions = {};
	if (parsed.data.cursor) {
		if (!isValidAuditCursor(parsed.data.cursor)) {
			return json(
				{
					error: {
						code: 'VALIDATION_FAILED',
						message: 'Please fix the highlighted fields.',
						fields: [{ path: 'cursor', message: 'Invalid cursor.' }]
					}
				},
				{ status: 422 }
			);
		}
		options.cursor = parsed.data.cursor;
	}
	if (parsed.data.limit != null) options.limit = parsed.data.limit;

	const result = await readAuditLog(
		getDb(),
		{
			targetType: parsed.data.targetType,
			targetId: parsed.data.targetId
		},
		options
	);

	return json(success(result.entries, { nextCursor: result.nextCursor }));
};
