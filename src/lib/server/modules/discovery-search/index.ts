import type { UserId } from '../../shared/ids';
export { parseMapsTo, LEXICON_ENTRY_TYPES, type LexiconEntryType } from './domain/maps-to';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
