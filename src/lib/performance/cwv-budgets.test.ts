import { describe, expect, it } from 'vitest';
import {
	CWV_4G_DOWNLOAD_BPS,
	CWV_4G_LATENCY_MS,
	CWV_CLS_MAX,
	CWV_CPU_THROTTLE,
	CWV_CORE_JS_BYTES,
	CWV_FILTER_APPLY_MS,
	CWV_HOMEPAGE_FCP_MS,
	CWV_PROFILE_NAV_MS,
	CWV_SUGGESTION_MS,
	coreJsPayloadBudgetBytes,
	filterApplyBudgetMs,
	homepageInteractiveBudgetMs,
	profileNavigationBudgetMs,
	suggestionRenderBudgetMs
} from './cwv-budgets';

describe('cwv lab budgets', () => {
	it('pins the SRS mid-range 4G + CPU profile and homepage FCP budget', () => {
		expect(CWV_4G_DOWNLOAD_BPS).toBe((4 * 1024 * 1024) / 8);
		expect(CWV_4G_LATENCY_MS).toBe(20);
		expect(CWV_CPU_THROTTLE).toBe(4);
		expect(CWV_HOMEPAGE_FCP_MS).toBe(3_000);
		expect(CWV_PROFILE_NAV_MS).toBe(2_500);
		expect(CWV_CLS_MAX).toBe(0.1);
	});

	it('uses the 3s gate only when E2E_CWV_STRICT is set', () => {
		expect(homepageInteractiveBudgetMs({ E2E_CWV_STRICT: '1' })).toBe(3_000);
		expect(homepageInteractiveBudgetMs({})).toBe(12_000);
		expect(profileNavigationBudgetMs({ E2E_CWV_STRICT: '1' })).toBe(2_500);
		expect(profileNavigationBudgetMs({})).toBe(10_000);
		expect(suggestionRenderBudgetMs({ E2E_CWV_STRICT: '1' })).toBe(CWV_SUGGESTION_MS);
		expect(suggestionRenderBudgetMs({})).toBe(2_000);
		expect(filterApplyBudgetMs({ E2E_CWV_STRICT: '1' })).toBe(CWV_FILTER_APPLY_MS);
		expect(coreJsPayloadBudgetBytes({ E2E_CWV_STRICT: '1' })).toBe(CWV_CORE_JS_BYTES);
	});
});
