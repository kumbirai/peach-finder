import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	actOnReport,
	dismissReport,
	getReportsQueueStats,
	listReportsQueue
} from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';
import { asId } from '$lib/server/shared/ids';
import {
	MODERATION_ACTION_KINDS,
	type ModerationActionKind
} from '$lib/server/modules/trust-and-safety/domain/moderation-actions';

export const _requiredRole: Role = 'admin';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const now = new Date();
	const [queue, stats] = await Promise.all([
		listReportsQueue(db, now),
		getReportsQueueStats(db, now)
	]);
	return {
		queue,
		stats,
		moderationActions: MODERATION_ACTION_KINDS,
		actReportId: url.searchParams.get('act')
	};
};

export const actions: Actions = {
	dismiss: async ({ request, locals }) => {
		const form = await request.formData();
		const reportId = String(form.get('reportId') ?? '');
		const note = String(form.get('note') ?? '').trim();
		if (!reportId) return fail(422, { message: 'Missing report.' });
		if (!note) return fail(422, { message: 'Enter a resolution note before dismissing.' });

		const result = await dismissReport(getDb(), {
			reportId: asId<'ReportId'>(reportId),
			adminId: locals.auth.userId!,
			note,
			idempotencyKey: request.headers.get('Idempotency-Key'),
			correlationId: locals.correlationId,
			now: new Date()
		});

		if (!result.ok) {
			return fail(422, { message: 'Could not dismiss this report.' });
		}

		return { dismissed: true, reportId };
	},
	act: async ({ request, locals }) => {
		const form = await request.formData();
		const reportId = String(form.get('reportId') ?? '');
		const action = String(form.get('action') ?? 'unpublish') as ModerationActionKind;
		const reason = String(form.get('reason') ?? '').trim();
		if (!reportId) return fail(422, { message: 'Missing report.' });
		if (!MODERATION_ACTION_KINDS.includes(action)) {
			return fail(422, { message: 'Choose a moderation action.' });
		}
		if (!reason) return fail(422, { message: 'Enter a reason for this moderation action.' });

		const result = await actOnReport(getDb(), {
			reportId: asId<'ReportId'>(reportId),
			adminId: locals.auth.userId!,
			action,
			reason,
			idempotencyKey: request.headers.get('Idempotency-Key'),
			correlationId: locals.correlationId,
			now: new Date()
		});

		if (!result.ok) {
			return fail(422, { message: 'Could not act on this report.' });
		}

		return { acted: true, reportId };
	}
};
