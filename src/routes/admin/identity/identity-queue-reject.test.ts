import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('identity queue reject deep-link', () => {
	it('opens the reject form from the reject query parameter', () => {
		const server = readFileSync(
			join(process.cwd(), 'src/routes/admin/identity/+page.server.ts'),
			'utf8'
		);
		const page = readFileSync(join(process.cwd(), 'src/routes/admin/identity/+page.svelte'), 'utf8');
		expect(server).toContain('rejectCaseId: url.searchParams.get(\'reject\')');
		expect(page).toContain('href={`/admin/identity?reject=${item.caseId}`}');
		expect(page).toContain('rejectOpenFor = data.rejectCaseId');
	});
});
