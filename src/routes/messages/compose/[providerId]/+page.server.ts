import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import type { ProviderProfileId } from '$lib/server/shared/ids';
import { isEmailVerified } from '$lib/server/modules/identity-and-access';
import {
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	sendOrHoldMessage,
	canSeekerMessageProvider
} from '$lib/server/modules/direct-messaging';
import { resolveComposerDraft } from '$lib/server/modules/direct-messaging/domain/service-context';
import { getPublicProfile, parseProviderProfileId } from '$lib/server/modules/provider-profile';
import { applyMessagingRateLimitsBeforeSend } from '$lib/server/modules/direct-messaging/infra/messaging-rate-limits';
import { useCaseErrorToHttp } from '$lib/server/shared/api';
import { notifyMessageSent } from '$lib/server/ws/hub';
import { getProfileOwnerIdDb } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'seeker';

export async function load({ params, locals, url }) {
	if (!params.providerId) error(404, 'Profile not found');
	const parsed = parseProviderProfileId(params.providerId);
	if (!parsed.ok) error(404, 'Profile not found');

	const db = getDb();
	const profile = await getPublicProfile(db, parsed.value, locals.auth);
	if (!profile.ok) error(404, 'Profile not found');

	if (!locals.auth.userId) error(401, 'Sign in required');

	const canMessage = await canSeekerMessageProvider(
		db,
		locals.auth.userId,
		parsed.value as ProviderProfileId
	);
	if (!canMessage) error(404, 'Profile not found');

	const thread = await getThreadForSeekerProvider(
		db,
		locals.auth.userId,
		parsed.value as ProviderProfileId
	);
	const pending = await getPendingForSeekerProvider(
		db,
		locals.auth.userId,
		parsed.value as ProviderProfileId
	);
	const emailVerified = await isEmailVerified(db, locals.auth.userId);

	const draft = resolveComposerDraft({
		draftParam: url.searchParams.get('draft'),
		serviceContextParam: url.searchParams.get('context'),
		pendingBody: pending?.body ?? null,
		hasExistingThread: thread !== null
	});

	if (thread) {
		redirect(303, `/messages/${thread.threadId}`);
	}

	return {
		providerProfileId: params.providerId,
		providerName: profile.value.displayName,
		thread,
		emailVerified,
		draft,
		verificationToken: url.searchParams.get('verificationToken')
	};
}

export const actions: Actions = {
	send: async ({ request, locals, params }) => {
		if (!locals.auth.userId) error(401, 'Sign in required');
		if (!params.providerId) error(404, 'Profile not found');

		const parsed = parseProviderProfileId(params.providerId);
		if (!parsed.ok) error(404, 'Profile not found');

		const db = getDb();
		const canMessage = await canSeekerMessageProvider(db, locals.auth.userId, parsed.value);
		if (!canMessage) error(404, 'Profile not found');

		const now = new Date();
		const limited = await applyMessagingRateLimitsBeforeSend(
			db,
			locals.auth.userId,
			parsed.value,
			now
		);
		if (!limited.ok) {
			const mapped = useCaseErrorToHttp(limited.error);
			return fail(mapped.status, { message: mapped.body.error.message });
		}

		const data = await request.formData();
		const body = String(data.get('body') ?? '');

		const result = await sendOrHoldMessage(db, {
			seekerId: locals.auth.userId,
			providerProfileId: parsed.value,
			body,
			now,
			correlationId: locals.correlationId
		});

		if (!result.ok) {
			if (result.error.kind === 'forbidden' && result.error.reason === 'blocked') {
				error(404, 'Profile not found');
			}
			if (result.error.kind === 'validation_failed') {
				const message = result.error.issues[0]?.message ?? 'Invalid message.';
				return fail(422, { message });
			}
			const mapped = useCaseErrorToHttp(result.error);
			return fail(mapped.status, { message: mapped.body.error.message });
		}

		if (result.value.kind === 'held') {
			return { held: true as const };
		}

		if (result.value.kind !== 'sent') {
			return fail(500, { message: 'Could not send message.' });
		}

		const ownerId = await getProfileOwnerIdDb(db, parsed.value);
		if (ownerId) {
			await notifyMessageSent({
				threadId: result.value.threadId,
				messageId: result.value.messageId,
				senderId: locals.auth.userId,
				recipientId: ownerId,
				body: body.trim(),
				sentAt: now
			});
		}

		redirect(303, `/messages/${result.value.threadId}`);
	}
};
