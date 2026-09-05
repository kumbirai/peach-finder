import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import {
	changePassword,
	clearSessionCookie,
	getSelfAccountSummary,
	revokeSession,
	updateDisplayName
} from '$lib/server/modules/identity-and-access';
import { loadOwnerProfile, ownsProfileDb } from '$lib/server/modules/provider-profile';
import { applyIdentityAttributesChangedSync } from '$lib/server/shared/identity-change-sync';
import { listBlocks } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'anonymous';

export async function load({ locals, url }) {
	if (!locals.auth.userId || locals.auth.role === 'anonymous') {
		return { account: null, providerProfile: null, blockedPeople: [], deleteConfirm: false };
	}

	const db = getDb();
	const account = await getSelfAccountSummary(db, locals.auth.userId);
	const providerProfile = (await ownsProfileDb(db, locals.auth.userId))
		? await loadOwnerProfile(db, locals.auth.userId)
		: null;
	const blocksResult = await listBlocks(db, locals.auth.userId);
	const blockedPeople = blocksResult.ok ? blocksResult.value : [];
	return {
		account,
		providerProfile,
		blockedPeople,
		deleteConfirm: url.searchParams.get('deleteConfirm') === '1'
	};
}

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		if (!locals.auth.userId || !locals.auth.sessionId) {
			return fail(401, { message: 'Please sign in to continue.' });
		}

		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const currentPassword = String(data.get('currentPassword') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');
		const confirmPassword = String(data.get('confirmPassword') ?? '');

		if (newPassword !== confirmPassword) {
			return fail(422, { message: 'New passwords do not match.' });
		}

		const limited = await consumeRateLimit(
			db,
			bucketSpec('auth_login'),
			`account:${locals.auth.userId}`,
			now
		);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
		}

		const result = await changePassword(
			db,
			{
				userId: locals.auth.userId,
				sessionId: locals.auth.sessionId,
				currentPassword,
				newPassword
			},
			now,
			locals.correlationId
		);

		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues });
			}
			return fail(403, { message: 'Current password is incorrect.' });
		}

		return { passwordChanged: true as const };
	},

	updateDisplayName: async ({ request, locals }) => {
		if (!locals.auth.userId) {
			return fail(401, { message: 'Please sign in to continue.' });
		}

		const db = getDb();
		const data = await request.formData();
		const displayName = String(data.get('displayName') ?? '');
		const now = new Date();
		const result = await updateDisplayName(
			db,
			locals.auth.userId,
			displayName,
			locals.correlationId,
			now
		);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues, displayName });
			}
			return fail(400, { message: 'Could not update your name.' });
		}
		if (result.value.identityEvent) {
			await applyIdentityAttributesChangedSync(db, result.value.identityEvent, now);
		}
		return { displayNameUpdated: true as const, displayName: result.value.displayName };
	},

	logout: async ({ locals, cookies }) => {
		const db = getDb();
		const now = new Date();
		if (locals.auth.sessionId) {
			await revokeSession(db, locals.auth.sessionId, now);
		}
		clearSessionCookie(cookies);
		redirect(303, '/');
	}
};
