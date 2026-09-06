import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('US-NOTIF-02 notification preferences tokens', () => {
	it('uses Terracotta focus ring on preference toggles', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/NotificationPreferences.svelte'),
			'utf8'
		);
		expect(source).toMatch(
			/\.toggle:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--color-peach-deep\)/s
		);
		expect(source).toMatch(/prefers-reduced-motion/);
	});

	it('avoids clobbering in-flight toggles when parent props refresh', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/NotificationPreferences.svelte'),
			'utf8'
		);
		expect(source).toMatch(/if \(savingKey !== null\) return;/);
		expect(source).toMatch(/syncedParentCategories = preferences\.categories;/);
		expect(source).toMatch(/categories = structuredClone\(body\.data\.categories\)/);
	});
});
