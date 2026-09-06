import { redirect } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	completePaymentMethodForOwner,
	createPaymentGateway
} from '$lib/server/modules/listing-billing';
import { publicAppOrigin } from '$lib/server/env';

export const _requiredRole: Role = 'provider';

export async function load({ locals, url }) {
	const reference = url.searchParams.get('reference');
	const returnUrl = url.searchParams.get('return') ?? '/provider/billing?payment=complete';

	if (!reference) {
		return { error: 'Missing payment reference.' };
	}

	const db = getDb();
	const gateway = createPaymentGateway(publicAppOrigin());
	const result = await completePaymentMethodForOwner(
		db,
		locals.auth.userId!,
		gateway,
		reference,
		new Date()
	);

	if (!result.ok) {
		return { error: 'Payment authorization was not completed.' };
	}

	throw redirect(303, returnUrl);
}
