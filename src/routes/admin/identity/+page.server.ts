import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	approveVerification,
	getIdentityQueueStats,
	listIdentityQueue,
	rejectVerification
} from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';
import { asId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'admin';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const now = new Date();
	const [queue, stats] = await Promise.all([
		listIdentityQueue(db, now),
		getIdentityQueueStats(db, now)
	]);
	return { queue, stats };
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		const form = await request.formData();
		const caseId = String(form.get('caseId') ?? '');
		if (!caseId) return fail(422, { message: 'Missing case.' });

		const result = await approveVerification(getDb(), {
			caseId: asId<'VerificationCaseId'>(caseId),
			adminId: locals.auth.userId!,
			reason: String(form.get('reason') ?? '').trim() || null,
			idempotencyKey: request.headers.get('Idempotency-Key'),
			correlationId: locals.correlationId,
			now: new Date()
		});

		if (!result.ok) {
			return fail(422, { message: 'Could not approve this case.' });
		}

		return { approved: true, caseId };
	},
	reject: async ({ request, locals }) => {
		const form = await request.formData();
		const caseId = String(form.get('caseId') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (!caseId) return fail(422, { message: 'Missing case.' });
		if (!reason) return fail(422, { message: 'Enter a rejection reason shown to the provider.' });

		const result = await rejectVerification(getDb(), {
			caseId: asId<'VerificationCaseId'>(caseId),
			adminId: locals.auth.userId!,
			reason,
			idempotencyKey: request.headers.get('Idempotency-Key'),
			correlationId: locals.correlationId,
			now: new Date()
		});

		if (!result.ok) {
			return fail(422, { message: 'Could not reject this case.' });
		}

		return { rejected: true, caseId };
	}
};
