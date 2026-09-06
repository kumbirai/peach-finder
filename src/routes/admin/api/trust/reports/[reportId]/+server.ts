import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getReportContext } from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';
import { asId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const report = await getReportContext(db, asId<'ReportId'>(params.reportId!), new Date());
	if (!report) {
		return json({ error: { code: 'NOT_FOUND', message: 'Report not found.' } }, { status: 404 });
	}
	return json(success(report));
};
