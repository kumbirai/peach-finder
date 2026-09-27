import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ProviderCard distance label', () => {
	it('exposes an aria-label that ends in away when distance is present', () => {
		const source = readFileSync(join(process.cwd(), 'src/lib/components/ProviderCard.svelte'), 'utf8');
		expect(source).toMatch(/aria-label=\{card\.distanceKm != null \? `\$\{formatDistanceKm\(card\.distanceKm\)\} away`/);
	});
});
