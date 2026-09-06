import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { removePhoto } from '$lib/server/modules/trust-and-safety';
import { asId } from '$lib/server/shared/ids';
import { createModerationRoute } from '../_handler';

const { _requiredRole, POST } = createModerationRoute(
	async ({ body, adminId, idempotencyKey, correlationId, now }) =>
		removePhoto(getDb(), {
			adminId: asId<'UserId'>(adminId),
			photoId: asId<'PhotoId'>(String(body.photoId)),
			reason: body.reason,
			idempotencyKey,
			correlationId,
			now
		}),
	z.object({ photoId: z.string().uuid() })
);

export { _requiredRole, POST };
