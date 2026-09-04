import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { exportUserData } from '$lib/server/modules/platform-configuration';
import { asId } from '$lib/server/shared/ids';
import { success, internalHttp } from '$lib/server/shared/api';
import { AuthorizationBug } from '$lib/server/shared/auth-context';

export const _requiredRole: Role = 'admin';

export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const userId = asId<'UserId'>(params.userId ?? '');
		const payload = await exportUserData(userId, locals.auth, getDb(), locals.correlationId);
		return json(success(payload), {
			headers: {
				'content-disposition': `attachment; filename="peach-finder-export-${userId}-${payload.generatedAt.slice(0, 10)}.json"`
			}
		});
	} catch (error) {
		if (error instanceof AuthorizationBug) {
			const mapped = internalHttp();
			return json(mapped.body, { status: mapped.status });
		}
		throw error;
	}
};
