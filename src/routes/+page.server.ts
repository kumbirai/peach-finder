import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { runSearch } from '$lib/server/modules/discovery-search';
import { getActiveLexiconForSearch } from '$lib/server/modules/platform-configuration';

export const _requiredRole: Role = 'anonymous';

export async function load({ url, locals }) {
	const db = getDb();
	const lexicon = await getActiveLexiconForSearch(db);

	const q = url.searchParams.get('q') ?? '';
	const verified = url.searchParams.get('verified') === '1';
	const available = url.searchParams.get('available') === '1';

	const result = await runSearch(
		db,
		{
			q,
			verified,
			available,
			lexicon
		},
		locals.auth
	);

	return {
		cards: result.cards,
		appliedIntents: result.appliedIntents,
		q,
		verified,
		available
	};
}
