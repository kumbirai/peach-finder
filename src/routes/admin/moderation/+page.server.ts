import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	reinstateAccount,
	removePhoto,
	removeReview,
	revokeBadge,
	suspendAccount,
	unpublishProfile
} from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';
import { asId } from '$lib/server/shared/ids';
import {
	MODERATION_ACTION_KINDS,
	type ModerationActionKind
} from '$lib/server/modules/trust-and-safety/domain/moderation-actions';

export const _requiredRole: Role = 'admin';

const ACTION_LABELS: Record<ModerationActionKind, string> = {
	remove_photo: 'Remove photo',
	remove_review: 'Remove review',
	unpublish: 'Unpublish profile',
	suspend: 'Suspend account',
	reinstate: 'Reinstate account',
	revoke_badge: 'Revoke identity badge'
};

export const load: PageServerLoad = async () => {
	return {
		actions: MODERATION_ACTION_KINDS.map((action) => ({
			value: action,
			label: ACTION_LABELS[action]
		}))
	};
};

async function runAction(run: () => Promise<{ ok: boolean }>) {
	const result = await run();
	if (!result.ok) {
		return fail(422, { message: 'Could not complete this moderation action.' });
	}
	return { success: true };
}

export const actions: Actions = {
	moderate: async ({ request, locals }) => {
		const form = await request.formData();
		const action = String(form.get('action') ?? '') as ModerationActionKind;
		const reason = String(form.get('reason') ?? '').trim();
		const targetId = String(form.get('targetId') ?? '').trim();

		if (!MODERATION_ACTION_KINDS.includes(action)) {
			return fail(422, { message: 'Choose a moderation action.' });
		}
		if (!reason) {
			return fail(422, { message: 'Enter a reason before taking action.' });
		}
		if (!targetId) {
			return fail(422, { message: 'Enter the target identifier.' });
		}

		const base = {
			adminId: locals.auth.userId!,
			reason,
			idempotencyKey: request.headers.get('Idempotency-Key'),
			correlationId: locals.correlationId,
			now: new Date()
		};

		switch (action) {
			case 'remove_photo':
				return runAction(async () =>
					removePhoto(getDb(), {
						...base,
						photoId: asId<'PhotoId'>(targetId)
					})
				);
			case 'remove_review': {
				const reviewInput = {
					...base,
					reviewId: asId<'ReviewId'>(targetId)
				};
				if (form.get('part') === 'reply') {
					return runAction(async () => removeReview(getDb(), { ...reviewInput, part: 'reply' }));
				}
				return runAction(async () => removeReview(getDb(), reviewInput));
			}
			case 'unpublish':
				return runAction(async () =>
					unpublishProfile(getDb(), {
						...base,
						providerProfileId: asId<'ProviderProfileId'>(targetId)
					})
				);
			case 'suspend':
				return runAction(async () =>
					suspendAccount(getDb(), {
						...base,
						userId: asId<'UserId'>(targetId)
					})
				);
			case 'reinstate':
				return runAction(async () =>
					reinstateAccount(getDb(), {
						...base,
						userId: asId<'UserId'>(targetId)
					})
				);
			case 'revoke_badge':
				return runAction(async () =>
					revokeBadge(getDb(), {
						...base,
						providerProfileId: asId<'ProviderProfileId'>(targetId)
					})
				);
			default:
				return fail(422, { message: 'Unsupported action.' });
		}
	}
};
