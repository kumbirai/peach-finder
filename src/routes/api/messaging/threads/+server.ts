import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { zId } from '$lib/server/shared/zod';
import {
	listProviderInbox,
	listSeekerThreads,
	sendOrHoldMessage,
	toThreadListItem
} from '$lib/server/modules/direct-messaging';
import { applyMessagingRateLimitsBeforeSend } from '$lib/server/modules/direct-messaging/infra/messaging-rate-limits';
import { isEmailVerified } from '$lib/server/modules/identity-and-access';
import { parseProviderProfileId, getProfileOwnerIdDb } from '$lib/server/modules/provider-profile';
import { notifyMessageSent } from '$lib/server/ws/hub';

export const _requiredRole: Role = 'seeker';

const CreateThreadSchema = z.object({
	providerProfileId: zId<'ProviderProfileId'>(),
	body: z.string().min(1).max(4000),
	serviceContext: z.string().min(1).max(200).optional()
});

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	const db = getDb();
	const audience = url.searchParams.get('audience');
	const threads =
		audience === 'provider'
			? await listProviderInbox(db, locals.auth.userId)
			: await listSeekerThreads(db, locals.auth.userId);

	return json(success({ threads: threads.map(toThreadListItem) }));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{
				status: 401
			}
		);
	}

	const db = getDb();
	const now = new Date();

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

	const parsed = CreateThreadSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: parsed.error.issues.map((i) => ({
						path: i.path.join('.'),
						message: i.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const profileId = parseProviderProfileId(parsed.data.providerProfileId);
	if (!profileId.ok) {
		const mapped = useCaseErrorToHttp(profileId.error);
		return json(mapped.body, { status: mapped.status });
	}

	const limited = await applyMessagingRateLimitsBeforeSend(
		db,
		locals.auth.userId,
		profileId.value,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const result = await sendOrHoldMessage(db, {
		seekerId: locals.auth.userId,
		providerProfileId: profileId.value,
		body: parsed.data.body,
		now,
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	const value = result.value;
	if (value.kind === 'held') {
		const verified = await isEmailVerified(db, locals.auth.userId);
		return json(
			success({
				status: 'held_pending_verification',
				emailVerified: verified,
				pendingId: value.pendingId
			})
		);
	}

	if (value.kind === 'sent') {
		const ownerId = await getProfileOwnerIdDb(db, profileId.value);
		if (ownerId) {
			await notifyMessageSent({
				threadId: value.threadId,
				messageId: value.messageId,
				senderId: locals.auth.userId,
				recipientId: ownerId,
				body: parsed.data.body.trim(),
				sentAt: now
			});
		}

		return json(
			success({
				status: 'sent',
				threadId: value.threadId,
				messageId: value.messageId
			})
		);
	}

	return json(success({ status: 'unknown' }));
};
