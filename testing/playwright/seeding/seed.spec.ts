import { expect, test } from '@playwright/test';
import { writePersona } from './manifest';
import { seedOnePersona } from './orchestrator';
import { selectedPersonas } from './persona-matrix';
import { isProductionBaseUrl, requiredEnvMessage } from './seed.config';

test.describe.configure({ mode: 'default', retries: 0 });

test.beforeAll(() => {
	const blocked = requiredEnvMessage();
	expect(blocked, blocked ?? 'seeding environment is configured').toBeNull();
	expect(isProductionBaseUrl(), 'refusing to seed production').toBeFalsy();
});

for (const spec of selectedPersonas()) {
	test(`seed ${spec.key}: ${spec.role} / ${spec.displayName}`, async ({ page }) => {
		test.setTimeout(180_000);
		const seeded = await seedOnePersona(page, spec);
		expect(seeded.displayName).toBe(spec.displayName);
		expect(seeded.email).toMatch(/@/);
		expect(seeded.partial, `${spec.key} completed without partial markers`).toBe(false);
		if (spec.role === 'provider') {
			expect(seeded.profileId).toBeTruthy();
		}
		writePersona(seeded);
	});
}
