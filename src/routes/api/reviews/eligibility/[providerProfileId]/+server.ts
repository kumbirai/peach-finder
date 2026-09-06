import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import {
	getReviewEligibilityDto,
	parseProviderProfileId
} from '$lib/server/modules/provider-reviews';

export const _requiredRole: Role = 'seeker';

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	const db = getDb();
	const limited = await consumeRateLimit(
		db,
		bucketSpec('search_query'),
		`ip:${getClientAddress()}`,
		new Date()
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const parsed = parseProviderProfileId(params.providerProfileId!);
	if (!parsed.ok) {
		const mapped = useCaseErrorToHttp(parsed.error);
		return json(mapped.body, { status: mapped.status });
	}

	const eligibility = await getReviewEligibilityDto(
		db,
		locals.auth.userId,
		parsed.value,
		new Date()
	);

	return json(success(eligibility));
};
