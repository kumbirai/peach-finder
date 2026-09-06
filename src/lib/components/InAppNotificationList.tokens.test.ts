import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('US-NOTIF-04 in-app notification list deep-link chrome', () => {
	it('uses open-and-mark-read links with action labels and reduced-motion respect', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/InAppNotificationList.svelte'),
			'utf8'
		);
		expect(source).toMatch(/prefers-reduced-motion/);
		expect(source).toMatch(/data-testid="in-app-notifications-list"/);
		expect(source).toMatch(/openHref/);
		expect(source).toMatch(/actionLabel/);
		expect(source).toMatch(/data-deep-link-path/);
		expect(source).toMatch(/min-height: 44px/);
	});
});
