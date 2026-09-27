import { matchesGlob, seedOnlyGlob } from './seed.config';
import type { SeedPersonaSpec } from './types';

export const PERSONA_MATRIX: SeedPersonaSpec[] = [
	{
		key: 'ui-provider-available',
		role: 'provider',
		displayName: 'UI Seed Provider',
		password: 'password123'
	},
	{
		key: 'ui-seeker',
		role: 'seeker',
		displayName: 'UI Seed Seeker',
		password: 'password123'
	}
];

export function selectedPersonas(): SeedPersonaSpec[] {
	const glob = seedOnlyGlob();
	if (!glob) return PERSONA_MATRIX;
	return PERSONA_MATRIX.filter((spec) => matchesGlob(spec.key, glob));
}
