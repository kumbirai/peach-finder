import type { UserId } from '../../shared/ids';
import { runSearch, runSuggest, type SearchInput, type SearchResult } from './app/search';

export { parseMapsTo, LEXICON_ENTRY_TYPES, type LexiconEntryType } from './domain/maps-to';
export {
	parseQuery,
	dedupeIntents,
	type ManualFilters,
	type ParseConfig
} from './domain/parse-query';
export { suggestRelaxation, type RelaxationSuggestion } from './domain/suggest-relaxation';
export { resolveSearchCoords, type ResolvedSearchCoords } from './app/resolve-search-coords';
export { runSearch, runSuggest, type SearchInput, type SearchResult };
export type { SearchCard, Suggestion } from './app/serializers';

export { removeSearchProjection } from './infra/projection-commands';
export { handleModerationProjectionRemove } from './infra/moderation-subscriptions';
export { upsertSearchProjection } from './infra/projection-upsert';
export {
	refreshSearchProjection,
	refreshSearchDisplayName,
	updateSearchBadgeFlag,
	mirrorAvailabilityOnProjection
} from './infra/projection-handlers';
export { handleUserBlocked, handleUserUnblocked } from './infra/subscriptions';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
