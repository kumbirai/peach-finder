import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('reports queue act deep-link', () => {
	it('keeps the moderation picker open when the act query changes', () => {
		const page = readFileSync(join(process.cwd(), 'src/routes/admin/reports/+page.svelte'), 'utf8');
		expect(page).toContain('actOpenFor = data.actReportId');
		expect(page).toContain('href={`/admin/reports?act=${item.reportId}`}');
	});
});
