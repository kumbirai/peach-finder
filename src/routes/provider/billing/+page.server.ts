import { redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	getBillingHistoryForOwner,
	getBillingPriceForOwner,
	getSelfServeBillingForOwner
} from '$lib/server/modules/listing-billing';

export const _requiredRole: Role = 'provider';

export async function load({ locals }) {
	const db = getDb();
	const ownerId = locals.auth.userId!;

	const [billing, priceResult, historyResult] = await Promise.all([
		getSelfServeBillingForOwner(db, ownerId),
		getBillingPriceForOwner(db, ownerId),
		getBillingHistoryForOwner(db, ownerId, { cursor: null, limit: 20 })
	]);

	if (!billing) {
		return {
			billing: null,
			price: null,
			history: [],
			nextCursor: null
		};
	}

	return {
		billing,
		price: priceResult.ok ? priceResult.value : null,
		history: historyResult.ok ? historyResult.value.items : [],
		nextCursor: historyResult.ok ? historyResult.value.nextCursor : null
	};
}

export const actions: Actions = {
	default: async () => {
		redirect(303, '/provider/billing');
	}
};
