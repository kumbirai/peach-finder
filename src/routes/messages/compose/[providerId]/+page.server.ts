import { error, fail, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import type { ProviderProfileId } from '$lib/server/shared/ids';
import { isEmailVerified } from '$lib/server/modules/identity-and-access';
import {
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	sendOrHoldMessage
} from '$lib/server/modules/direct-messaging';
import { getPublicProfile, parseProviderProfileId } from '$lib/server/modules/provider-profile';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';

export const _requiredRole: Role = 'seeker';

export async function load({ params, locals, url }) {
	if (!params.providerId) error(404, 'Profile not found');
	const parsed = parseProviderProfileId(params.providerId);
	if (!parsed.ok) error(404, 'Profile not found');

	const db = getDb();
	const profile = await getPublicProfile(db, parsed.value, locals.auth);
	if (!profile.ok) error(404, 'Profile not found');

	if (!locals.auth.userId) error(401, 'Sign in required');

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

	const draft = url.searchParams.get('draft') ?? pending?.body ?? '';

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
		const now = new Date();
		const limited = await consumeRateLimit(
			db,
			bucketSpec('message_send'),
			`account:${locals.auth.userId}`,
			now
		);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
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
			if (result.error.kind === 'validation_failed') {
				const message = result.error.issues[0]?.message ?? 'Invalid message.';
				return fail(422, { message });
			}
			return fail(400, { message: 'Could not send message.' });
		}

		if (result.value.kind === 'held') {
			return { held: true as const };
		}

		return { sent: true as const };
	}
};
