import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SearchFilters navigation', () => {
	it('toggles filters through href chips instead of Svelte onclick handlers', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/SearchFilters.svelte'),
			'utf8'
		);
		expect(source).toMatch(/manualFilterHrefs/);
		expect(source).toMatch(/availableToggleHref/);
		expect(source).toMatch(/href=\{manualFilterHrefs\[intentKey\] \?\? '\/'\}/);
		expect(source).toMatch(/href=\{availableToggleHref\}/);
		expect(source).not.toMatch(/onToggleManualFilter/);
		expect(source).not.toMatch(/onclick=/);
	});
});
