import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import type { Role } from '$lib/server/shared/auth-context';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import type { Result, UseCaseError } from '$lib/server/shared/result';

const reasonSchema = z.object({
	reason: z.string().trim().min(1).max(2000)
});

export function createModerationRoute(
	run: (input: {
		body: z.infer<typeof reasonSchema> & Record<string, unknown>;
		adminId: string;
		idempotencyKey: string | null;
		correlationId: string;
		now: Date;
	}) => Promise<Result<unknown, UseCaseError>>,
	extraSchema?: z.ZodObject<z.ZodRawShape>
): { _requiredRole: Role; POST: RequestHandler } {
	const bodySchema = extraSchema ? reasonSchema.merge(extraSchema) : reasonSchema;

	return {
		_requiredRole: 'admin',
		POST: async ({ request, locals }) => {
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

			const result = await run({
				body: parsed.data as z.infer<typeof reasonSchema> & Record<string, unknown>,
				adminId: locals.auth.userId!,
				idempotencyKey: request.headers.get('Idempotency-Key'),
				correlationId: locals.correlationId,
				now: new Date()
			});

			if (!result.ok) {
				const mapped = useCaseErrorToHttp(result.error);
				return json(mapped.body, { status: mapped.status });
			}

			return json(success(result.value));
		}
	};
}
