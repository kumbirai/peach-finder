import { expect, test } from '@playwright/test';

const RETENTION_NOW = '2026-09-06T12:00:00.000Z';

test.describe.configure({ mode: 'serial' });

test.describe('US-PRIV-03 data that expires on schedule', () => {
	test('TC-PRIV-03a: identity docs purge at 90 days post-decision', async ({ request }) => {
		const seedRes = await request.post('/api/dev/retention-fixture', {
			data: { scenario: 'identity-doc', now: RETENTION_NOW }
		});
		expect(seedRes.ok()).toBeTruthy();
		const seedBody = (await seedRes.json()) as {
			data: { caseId: string; photoId: string };
		};

		const tickRes = await request.post('/api/dev/retention-tick', {
			data: { now: RETENTION_NOW }
		});
		expect(tickRes.ok()).toBeTruthy();
		const tickBody = (await tickRes.json()) as {
			data: { identityDocs: { casesPurged: number } };
		};
		expect(tickBody.data.identityDocs.casesPurged).toBeGreaterThanOrEqual(1);

		const verifyRes = await request.post('/api/dev/retention-verify', {
			data: {
				scenario: 'identity-doc',
				caseId: seedBody.data.caseId,
				photoId: seedBody.data.photoId
			}
		});
		expect(verifyRes.ok()).toBeTruthy();
		const verifyBody = (await verifyRes.json()) as {
			data: { metadataRetained: boolean; docsPurgedAt: string | null; photoRemoved: boolean };
		};
		expect(verifyBody.data.metadataRetained).toBe(true);
		expect(verifyBody.data.docsPurgedAt).toBeTruthy();
		expect(verifyBody.data.photoRemoved).toBe(true);
	});

	test('TC-PRIV-03b: dormant thread purge at 24 months', async ({ request }) => {
		const seedRes = await request.post('/api/dev/retention-fixture', {
			data: { scenario: 'dormant-thread', now: RETENTION_NOW }
		});
		expect(seedRes.ok()).toBeTruthy();
		const seedBody = (await seedRes.json()) as { data: { seekerId: string } };

		const tickRes = await request.post('/api/dev/retention-tick', {
			data: { now: RETENTION_NOW }
		});
		expect(tickRes.ok()).toBeTruthy();
		const tickBody = (await tickRes.json()) as {
			data: { dormantThreads: { threadsPurged: number } };
		};
		expect(tickBody.data.dormantThreads.threadsPurged).toBeGreaterThanOrEqual(1);

		const verifyRes = await request.post('/api/dev/retention-verify', {
			data: {
				scenario: 'dormant-thread',
				seekerId: seedBody.data.seekerId
			}
		});
		expect(verifyRes.ok()).toBeTruthy();
		const verifyBody = (await verifyRes.json()) as {
			data: { threadPurged: boolean };
		};
		expect(verifyBody.data.threadPurged).toBe(true);
	});

	test('TC-PRIV-03c: deletion anonymization covered by US-ACC-05 TC-ACC-05d', async () => {
		test.info().annotations.push({
			type: 'cross-ref',
			description: 'TC-ACC-05d in delete-account integration + e2e specs'
		});
	});

	test('TC-PRIV-03d: raw analytics destroyed at 90 days while aggregates survive', async ({
		request
	}) => {
		const seedRes = await request.post('/api/dev/retention-fixture', {
			data: { scenario: 'analytics', now: RETENTION_NOW }
		});
		expect(seedRes.ok()).toBeTruthy();

		const tickRes = await request.post('/api/dev/retention-tick', {
			data: { now: RETENTION_NOW }
		});
		expect(tickRes.ok()).toBeTruthy();
		const tickBody = (await tickRes.json()) as {
			data: { analytics: { purgedRawEvents: number } };
		};
		expect(tickBody.data.analytics.purgedRawEvents).toBeGreaterThanOrEqual(1);

		const verifyRes = await request.post('/api/dev/retention-verify', {
			data: { scenario: 'analytics' }
		});
		expect(verifyRes.ok()).toBeTruthy();
		const verifyBody = (await verifyRes.json()) as {
			data: { rawEventsRemaining: number; rollupProfileViews: number };
		};
		expect(verifyBody.data.rawEventsRemaining).toBe(1);
		expect(verifyBody.data.rollupProfileViews).toBeGreaterThan(0);
	});
});
