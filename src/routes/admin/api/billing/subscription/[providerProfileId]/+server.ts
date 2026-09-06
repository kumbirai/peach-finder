import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getSubscription } from '$lib/server/modules/listing-billing';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';
import { ERROR_CODES } from '$lib/server/shared/event-catalog';
import { asId, InvalidIdError } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async ({ params }) => {
	let providerProfileId;
	try {
		providerProfileId = asId<'ProviderProfileId'>(params.providerProfileId ?? '');
	} catch (error) {
		if (error instanceof InvalidIdError) {
			return json(
				{
					error: {
						code: ERROR_CODES.VALIDATION_FAILED,
						message: 'Invalid profile id.',
						fields: null
					}
				},
				{ status: 422 }
			);
		}
		throw error;
	}

	const subscription = await getSubscription(getDb(), providerProfileId);
	if (!subscription) {
		return json(
			{
				error: {
					code: 'NOT_FOUND',
					message: 'No listing subscription for this profile.',
					fields: null
				}
			},
			{ status: 404 }
		);
	}
	return json(success(subscription));
};
