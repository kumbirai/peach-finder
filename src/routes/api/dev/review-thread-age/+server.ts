import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { zId } from '$lib/server/shared/zod';
import { threads } from '$lib/server/modules/direct-messaging/infra/schema';
import { and, eq } from 'drizzle-orm';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	seekerId: zId<'UserId'>(),
	providerProfileId: zId<'ProviderProfileId'>(),
	ageHours: z.number().min(0).max(720)
});

export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const parsed = BodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const now = new Date();
	const createdAt = new Date(now.getTime() - parsed.data.ageHours * 60 * 60 * 1000);
	const db = getDb();

	const updated = await db
		.update(threads)
		.set({ createdAt, lastActivityAt: createdAt })
		.where(
			and(
				eq(threads.seekerId, parsed.data.seekerId),
				eq(threads.providerProfileId, parsed.data.providerProfileId)
			)
		)
		.returning({ id: threads.id });

	if (!updated[0]) {
		return json({ error: 'Thread not found' }, { status: 404 });
	}

	return json({
		data: {
			threadId: updated[0].id,
			createdAt: createdAt.toISOString()
		}
	});
};
