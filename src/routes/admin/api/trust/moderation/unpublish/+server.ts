import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { unpublishProfile } from '$lib/server/modules/trust-and-safety';
import { asId } from '$lib/server/shared/ids';
import { createModerationRoute } from '../_handler';

const { _requiredRole, POST } = createModerationRoute(
	async ({ body, adminId, idempotencyKey, correlationId, now }) =>
		unpublishProfile(getDb(), {
			adminId: asId<'UserId'>(adminId),
			providerProfileId: asId<'ProviderProfileId'>(String(body.providerProfileId)),
			reason: body.reason,
			idempotencyKey,
			correlationId,
			now
		}),
	z.object({ providerProfileId: z.string().uuid() })
);

export { _requiredRole, POST };
