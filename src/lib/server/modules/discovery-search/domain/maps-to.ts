import { z } from 'zod';

export const LEXICON_ENTRY_TYPES = [
	'service_term',
	'language',
	'intent_availability',
	'intent_rating',
	'intent_verification',
	'intent_proximity',
	'synonym'
] as const;

export type LexiconEntryType = (typeof LEXICON_ENTRY_TYPES)[number];

export const mapsToSchemaByType: Record<LexiconEntryType, z.ZodType> = {
	service_term: z.object({ serviceTagId: z.string().uuid() }),
	language: z.object({ language: z.string().min(1) }),
	intent_availability: z.object({ filter: z.literal('available_now') }),
	intent_rating: z.object({ filter: z.literal('highly_rated') }),
	intent_verification: z.object({ filter: z.literal('verified') }),
	intent_proximity: z.object({ filter: z.literal('near_me') }),
	synonym: z.object({ of: z.string().min(1) })
};

export function parseMapsTo(entryType: LexiconEntryType, value: unknown) {
	return mapsToSchemaByType[entryType].safeParse(value);
}
