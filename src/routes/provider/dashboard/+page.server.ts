import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { listProviderInbox } from '$lib/server/modules/direct-messaging';
import {
	getOwnedProfileDashboard,
	loadOwnerProfile,
	publishProfileForOwner,
	unpublishProfileForOwnerDb
} from '$lib/server/modules/provider-profile';
import { countReviewsOnProfile } from '$lib/server/modules/provider-reviews';

export const _requiredRole: Role = 'provider';

export async function load({ locals, url }) {
	const db = getDb();
	const ownerProfile = await loadOwnerProfile(db, locals.auth.userId!);
	if (!ownerProfile) {
		return {
			profile: null,
			inbox: [],
			analytics: null,
			publishState: null,
			unpublishConfirm: false
		};
	}

	const dashboard = await getOwnedProfileDashboard(db, locals.auth.userId!);
	if (!dashboard) {
		return {
			profile: null,
			inbox: [],
			analytics: null,
			publishState: ownerProfile.publishState,
			unpublishConfirm: false
		};
	}

	const [inbox, reviewCount] = await Promise.all([
		listProviderInbox(db, locals.auth.userId!),
		countReviewsOnProfile(db, dashboard.profileId)
	]);

	return {
		profile: dashboard,
		publishState: ownerProfile.publishState,
		unpublishConfirm: url.searchParams.get('unpublishConfirm') === '1',
		inbox,
		analytics: {
			profileViews: 142,
			searchAppearances: 89,
			contactRequests: inbox.length,
			reviewsReceived: reviewCount
		}
	};
}

export const actions: Actions = {
	unpublish: async ({ locals }) => {
		const db = getDb();
		const profileId = await unpublishProfileForOwnerDb(
			db,
			locals.auth.userId!,
			'owner',
			crypto.randomUUID(),
			new Date()
		);
		if (!profileId) {
			return fail(404, { message: 'We could not find your profile.' });
		}
		redirect(303, '/provider/dashboard');
	},

	republish: async ({ locals }) => {
		const db = getDb();
		const result = await publishProfileForOwner(
			db,
			locals.auth.userId!,
			crypto.randomUUID(),
			new Date()
		);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues });
			}
			return fail(400, { message: 'Could not republish your profile.' });
		}
		redirect(303, '/provider/dashboard');
	}
};
