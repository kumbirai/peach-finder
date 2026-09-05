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
import {
	clearAvailabilityForOwner,
	getAvailabilityTransparencyForOwner,
	setAvailabilityForOwner
} from '$lib/server/modules/provider-availability';
import {
	listUnreadInAppNotifications,
	markAvailabilityRenewalReadForOwner,
	markInAppNotificationsRead
} from '$lib/server/modules/user-notifications';

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
			unpublishConfirm: false,
			availability: {
				state: 'not_available' as const,
				setAt: null,
				expiresAt: null,
				expiresInSeconds: null
			},
			activeThisWeek: null,
			renewalNotification: null
		};
	}

	const dashboard = await getOwnedProfileDashboard(db, locals.auth.userId!);
	if (!dashboard) {
		return {
			profile: null,
			inbox: [],
			analytics: null,
			publishState: ownerProfile.publishState,
			unpublishConfirm: false,
			availability: {
				state: 'not_available' as const,
				setAt: null,
				expiresAt: null,
				expiresInSeconds: null
			},
			activeThisWeek: null,
			renewalNotification: null
		};
	}

	const [inbox, reviewCount, transparencyResult, notifications] = await Promise.all([
		listProviderInbox(db, locals.auth.userId!),
		countReviewsOnProfile(db, dashboard.profileId),
		getAvailabilityTransparencyForOwner(db, locals.auth.userId!, new Date()),
		listUnreadInAppNotifications(db, locals.auth.userId!, 5)
	]);

	const availability =
		transparencyResult.ok && ownerProfile.publishState === 'published'
			? transparencyResult.value.availability
			: {
					state: 'not_available' as const,
					setAt: null,
					expiresAt: null,
					expiresInSeconds: null
				};

	const activeThisWeek =
		transparencyResult.ok && ownerProfile.publishState === 'published'
			? transparencyResult.value.activeThisWeek
			: null;

	const renewalNotification =
		availability.state !== 'not_available'
			? (notifications.find((n) => n.category === 'availability_expiry_warning') ?? null)
			: null;

	return {
		profile: dashboard,
		publishState: ownerProfile.publishState,
		unpublishConfirm: url.searchParams.get('unpublishConfirm') === '1',
		inbox: inbox.map((t) => ({
			...t,
			lastActivityAt: t.lastActivityAt.toISOString()
		})),
		availability,
		activeThisWeek,
		renewalNotification,
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
	},

	toggleAvailability: async ({ locals }) => {
		const db = getDb();
		const now = new Date();
		const correlationId = crypto.randomUUID();
		const current = await getAvailabilityTransparencyForOwner(db, locals.auth.userId!, now);
		if (!current.ok) {
			return fail(404, { message: 'We could not find your profile.' });
		}

		const result =
			current.value.availability.state === 'not_available'
				? await setAvailabilityForOwner(db, locals.auth.userId!, correlationId, now)
				: await clearAvailabilityForOwner(db, locals.auth.userId!, correlationId, now);

		if (!result.ok) {
			return fail(400, { message: 'Could not update your availability.' });
		}

		const refreshed = await getAvailabilityTransparencyForOwner(db, locals.auth.userId!, now);
		if (!refreshed.ok) {
			return { availability: result.value };
		}

		return {
			availability: refreshed.value.availability,
			activeThisWeek: refreshed.value.activeThisWeek
		};
	},

	renewAvailability: async ({ locals, request }) => {
		const db = getDb();
		const now = new Date();
		const correlationId = crypto.randomUUID();
		const form = await request.formData();
		const notificationId = form.get('notificationId');

		const result = await setAvailabilityForOwner(db, locals.auth.userId!, correlationId, now);
		if (!result.ok) {
			return fail(400, { message: 'Could not renew your availability.' });
		}

		if (typeof notificationId === 'string' && notificationId.length > 0) {
			await markInAppNotificationsRead(db, locals.auth.userId!, [notificationId], now);
		} else {
			await markAvailabilityRenewalReadForOwner(db, locals.auth.userId!, now);
		}

		const refreshed = await getAvailabilityTransparencyForOwner(db, locals.auth.userId!, now);
		if (!refreshed.ok) {
			return { availability: result.value, renewalNotification: null };
		}

		return {
			availability: refreshed.value.availability,
			activeThisWeek: refreshed.value.activeThisWeek,
			renewalNotification: null
		};
	}
};
