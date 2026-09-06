import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_VERSIONS } from '$lib/server/modules/identity-and-access';
import { load } from './+page.server';

describe('terms page load', () => {
	it('surfaces the terms-of-service version identifier', () => {
		expect(load().version).toBe(LEGAL_DOCUMENT_VERSIONS['terms-of-service']);
	});

	it('reads the terms-of-service version key from the loader source', () => {
		const source = readFileSync(join(process.cwd(), 'src/routes/terms/+page.server.ts'), 'utf8');
		expect(source).toMatch(/LEGAL_DOCUMENT_VERSIONS\[['"]terms-of-service['"]\]/);
	});
});
