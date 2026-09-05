import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	loadOwnerProfile,
	updateIntro,
	updatePhoneVisibility,
	INTRO_MAX_LENGTH
} from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

export async function load({ locals }) {
	const db = getDb();
	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	if (!profile) {
		redirect(303, '/provider/register');
	}
	if (profile.publishState === 'draft') {
		redirect(303, '/provider/onboarding');
	}

	return { profile, introMaxLength: INTRO_MAX_LENGTH };
}

export const actions: Actions = {
	saveIntro: async ({ request, locals }) => {
		const db = getDb();
		const data = await request.formData();
		const intro = String(data.get('intro') ?? '');
		const result = await updateIntro(
			db,
			locals.auth.userId!,
			intro,
			crypto.randomUUID(),
			new Date()
		);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues, intro });
			}
			return fail(400, { message: 'Could not save your introduction.' });
		}
		return { saved: true as const, intro: intro.trim() };
	},
	savePhoneVisibility: async ({ request, locals }) => {
		const db = getDb();
		const data = await request.formData();
		const visible = String(data.get('visible') ?? '') === 'true';
		const result = await updatePhoneVisibility(
			db,
			locals.auth.userId!,
			visible,
			crypto.randomUUID(),
			new Date()
		);
		if (!result.ok) {
			return fail(400, { message: 'Could not save your phone visibility setting.' });
		}
		return { saved: true as const, phoneVisible: visible };
	}
};
