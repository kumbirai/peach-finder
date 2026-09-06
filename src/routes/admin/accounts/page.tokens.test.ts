import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('US-ADMIN-05 account lookup page tokens', () => {
	it('uses Terracotta focus ring on disclosure controls', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/routes/admin/accounts/+page.svelte'),
			'utf8'
		);
		expect(source).toMatch(
			/\.detail-disclosure__summary:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--color-peach-deep\)/s
		);
	});
});
