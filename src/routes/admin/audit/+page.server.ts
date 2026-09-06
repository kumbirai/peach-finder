import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { readAuditLog, type ReadAuditLogOptions } from '$lib/server/modules/platform-configuration';
import type { Role } from '$lib/server/shared/auth-context';

export const _requiredRole: Role = 'admin';

const TARGET_TYPE_OPTIONS = [
	{ value: 'user', label: 'User account' },
	{ value: 'provider_profile', label: 'Provider profile' },
	{ value: 'verification_case', label: 'Verification case' },
	{ value: 'report', label: 'Report' },
	{ value: 'platform_config', label: 'Platform config' },
	{ value: 'photo', label: 'Photo' },
	{ value: 'review', label: 'Review' }
] as const;

const TARGET_ID_UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePageLimit(raw: string | null): number | undefined {
	if (!raw) return undefined;
	const limit = Number.parseInt(raw, 10);
	if (Number.isNaN(limit)) return undefined;
	return limit;
}

export const load: PageServerLoad = async ({ url }) => {
	const targetType = (url.searchParams.get('targetType') ?? '').trim();
	const targetId = (url.searchParams.get('targetId') ?? '').trim();
	const limit = parsePageLimit(url.searchParams.get('limit'));

	if (!targetType || !targetId) {
		return {
			targetType,
			targetId,
			targetTypeOptions: TARGET_TYPE_OPTIONS,
			entries: [],
			nextCursor: null as string | null,
			needsFilters: true,
			invalidFilters: false
		};
	}

	if (!TARGET_ID_UUID.test(targetId)) {
		return {
			targetType,
			targetId,
			targetTypeOptions: TARGET_TYPE_OPTIONS,
			entries: [],
			nextCursor: null,
			needsFilters: false,
			invalidFilters: true
		};
	}

	const options: ReadAuditLogOptions = {};
	if (limit != null) options.limit = limit;

	const result = await readAuditLog(getDb(), { targetType, targetId }, options);
	return {
		targetType,
		targetId,
		targetTypeOptions: TARGET_TYPE_OPTIONS,
		entries: result.entries,
		nextCursor: result.nextCursor,
		needsFilters: false,
		invalidFilters: false
	};
};
