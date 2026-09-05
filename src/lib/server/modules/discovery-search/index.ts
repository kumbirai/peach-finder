import type { UserId } from '../../shared/ids';
import { runSearch, runSuggest, type SearchInput, type SearchResult } from './app/search';

export { parseMapsTo, LEXICON_ENTRY_TYPES, type LexiconEntryType } from './domain/maps-to';
export { runSearch, runSuggest, type SearchInput, type SearchResult };
export type { SearchCard } from './app/serializers';

export { removeSearchProjection } from './infra/projection-commands';
export { upsertSearchProjection } from './infra/projection-upsert';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
