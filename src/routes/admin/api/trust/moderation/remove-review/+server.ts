import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { removeReview } from '$lib/server/modules/trust-and-safety';
import { asId } from '$lib/server/shared/ids';
import { createModerationRoute } from '../_handler';

const { _requiredRole, POST } = createModerationRoute(
	async ({ body, adminId, idempotencyKey, correlationId, now }) => {
		const input = {
			adminId: asId<'UserId'>(adminId),
			reviewId: asId<'ReviewId'>(String(body.reviewId)),
			reason: body.reason,
			idempotencyKey,
			correlationId,
			now
		};
		if (body.part === 'reply') {
			return removeReview(getDb(), { ...input, part: 'reply' });
		}
		return removeReview(getDb(), input);
	},
	z.object({
		reviewId: z.string().uuid(),
		part: z.enum(['reply']).optional()
	})
);

export { _requiredRole, POST };
