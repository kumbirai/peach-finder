import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Button test hook', () => {
	it('forwards an optional testId onto the rendered control', () => {
		const source = readFileSync(join(process.cwd(), 'src/lib/components/Button.svelte'), 'utf8');
		expect(source).toMatch(/testId\?: string/);
		expect(source).toMatch(/data-testid=\{testId\}/);
	});
});
