import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('US-NOTIF-03 in-app notification list tokens', () => {
	it('uses Card links with reduced-motion respect for notification items', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/InAppNotificationList.svelte'),
			'utf8'
		);
		expect(source).toMatch(/prefers-reduced-motion/);
		expect(source).toMatch(/data-testid="in-app-notifications-list"/);
		expect(source).toMatch(/deepLinkPath/);
	});
});
