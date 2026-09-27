import { expect, test } from '@playwright/test';
import { assertPrimaryListingLive } from './live-backend-assert';

test.describe('identity-docs object-store policy', () => {
	test('anonymous GET of a real identity-docs key is denied at the store', async ({
		request
	}) => {
		await assertPrimaryListingLive(request);
		const response = await request.post('/api/dev/identity-doc-store-probe');
		expect(response.ok()).toBeTruthy();
		const body = (await response.json()) as {
			data: {
				reachable: boolean;
				anonymousUrl: string | null;
				anonymousStatus: number | null;
				deniedAtStore: boolean;
			};
		};
		if (!body.data.reachable) {
			test.skip(true, 'MinIO is not reachable on MINIO_ENDPOINT');
			return;
		}
		expect(body.data.anonymousUrl).toBeTruthy();
		expect(body.data.deniedAtStore).toBe(true);
		const anonymous = await request.get(body.data.anonymousUrl as string);
		expect(anonymous.status()).toBeGreaterThanOrEqual(400);
	});
});
