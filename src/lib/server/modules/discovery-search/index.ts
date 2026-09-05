import type { UserId } from '../../shared/ids';
import { runSearch, runSuggest, type SearchInput, type SearchResult } from './app/search';

export { parseMapsTo, LEXICON_ENTRY_TYPES, type LexiconEntryType } from './domain/maps-to';
export {
	parseQuery,
	dedupeIntents,
	type ManualFilters,
	type ParseConfig
} from './domain/parse-query';
export { runSearch, runSuggest, type SearchInput, type SearchResult };
export type { SearchCard } from './app/serializers';

export { removeSearchProjection } from './infra/projection-commands';
export { upsertSearchProjection } from './infra/projection-upsert';
export {
	refreshSearchProjection,
	refreshSearchDisplayName,
	updateSearchBadgeFlag,
	mirrorAvailabilityOnProjection
} from './infra/projection-handlers';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
