import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	generateTotpCode,
	loadAdminTotpSecret,
	findUserIdByEmail
} from '$lib/server/modules/identity-and-access';
import { readDevAdminEnrollmentSecret } from '$lib/server/modules/identity-and-access/infra/dev-verification';

export const _requiredRole: Role = 'anonymous';

const SEED_ADMIN_EMAIL = 'admin@example.com';

export const GET: RequestHandler = async ({ url }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return json({ error: 'Not available' }, { status: 404 });
	}

	const email = url.searchParams.get('email') ?? SEED_ADMIN_EMAIL;
	const db = getDb();
	const userId = await findUserIdByEmail(db, email);
	if (!userId) {
		return json({ error: 'Admin user not found' }, { status: 404 });
	}

	const pending = readDevAdminEnrollmentSecret(userId);
	const secret = pending ?? (await loadAdminTotpSecret(db, userId));
	if (!secret) {
		return json({ error: 'Admin TOTP not available' }, { status: 404 });
	}

	const code = generateTotpCode(secret, new Date());
	return json({ email, code, pending: pending != null });
};
