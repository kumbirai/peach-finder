import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ReportReasonForm reason chips', () => {
	it('submits taxonomy choices from native buttons so the click is not lost', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/ReportReasonForm.svelte'),
			'utf8'
		);
		expect(source).toContain('data-testid={`report-reason-${option.value}`}');
		expect(source).toContain('onclick={() => void chooseReason(option.value)}');
		expect(source).toContain('type="button"');
	});
});
