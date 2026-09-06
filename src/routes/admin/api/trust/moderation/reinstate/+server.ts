import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { reinstateAccount } from '$lib/server/modules/trust-and-safety';
import { asId } from '$lib/server/shared/ids';
import { createModerationRoute } from '../_handler';

const { _requiredRole, POST } = createModerationRoute(
	async ({ body, adminId, idempotencyKey, correlationId, now }) =>
		reinstateAccount(getDb(), {
			adminId: asId<'UserId'>(adminId),
			userId: asId<'UserId'>(String(body.userId)),
			reason: body.reason,
			idempotencyKey,
			correlationId,
			now
		}),
	z.object({ userId: z.string().uuid() })
);

export { _requiredRole, POST };
