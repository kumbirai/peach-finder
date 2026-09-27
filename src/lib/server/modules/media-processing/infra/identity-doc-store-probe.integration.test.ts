import { describe, expect, it } from 'vitest';
import { probeIdentityDocsAnonymousDenial } from './identity-doc-store-probe';

describe('identity-docs MinIO anonymous policy', () => {
	it('denies unauthenticated GET of a real object key', async (ctx) => {
		const probe = await probeIdentityDocsAnonymousDenial();
		if (!probe.reachable) {
			ctx.skip();
			return;
		}
		expect(probe.anonymousUrl).toMatch(/\/identity-docs\//);
		expect(probe.deniedAtStore).toBe(true);
		expect(probe.anonymousStatus).toBeGreaterThanOrEqual(400);
	});
});
