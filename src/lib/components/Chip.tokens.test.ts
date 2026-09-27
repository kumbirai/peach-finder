import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Chip selection tokens', () => {
	it('applies chip-selected from the selected prop on both link and button chips', () => {
		const source = readFileSync(join(process.cwd(), 'src/lib/components/Chip.svelte'), 'utf8');
		expect(source).toMatch(/<a class="chip" class:chip-selected=\{selected\}/);
		expect(source).toMatch(/class:chip-selected=\{selected\}/);
		expect(source).not.toMatch(/<a class="chip chip-selected"/);
	});
});
