import type { Page } from '@playwright/test';
import {
	CWV_4G_DOWNLOAD_BPS,
	CWV_4G_LATENCY_MS,
	CWV_4G_UPLOAD_BPS,
	CWV_CPU_THROTTLE
} from '../../src/lib/performance/cwv-budgets';

export type PageWebVitals = {
	fcpMs: number | null;
	lcpMs: number | null;
	cls: number;
};

export async function applyCwvLab(page: Page): Promise<void> {
	const session = await page.context().newCDPSession(page);
	await session.send('Network.enable');
	await session.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: CWV_4G_LATENCY_MS,
		downloadThroughput: CWV_4G_DOWNLOAD_BPS,
		uploadThroughput: CWV_4G_UPLOAD_BPS,
		connectionType: 'cellular4g'
	});
	await session.send('Emulation.setCPUThrottlingRate', { rate: CWV_CPU_THROTTLE });
}

export async function readPageWebVitals(page: Page): Promise<PageWebVitals> {
	return page.evaluate(() => {
		const paints = performance.getEntriesByType('paint');
		const fcp = paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null;
		const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
		const lcp = lcpEntries.at(-1)?.startTime ?? null;
		let cls = 0;
		for (const entry of performance.getEntriesByType('layout-shift')) {
			const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
			if (!shift.hadRecentInput) cls += shift.value ?? 0;
		}
		return { fcpMs: fcp, lcpMs: lcp, cls };
	});
}
