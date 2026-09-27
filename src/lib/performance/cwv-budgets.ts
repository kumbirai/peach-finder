/** Regular 4G-class throughput (bits/s ÷ 8) and RTT from the performance spec's mid-range profile. */
export const CWV_4G_DOWNLOAD_BPS = (4 * 1024 * 1024) / 8;
export const CWV_4G_UPLOAD_BPS = (1 * 1024 * 1024) / 8;
export const CWV_4G_LATENCY_MS = 20;
export const CWV_CPU_THROTTLE = 4;

export const CWV_HOMEPAGE_FCP_MS = 3_000;
export const CWV_PROFILE_NAV_MS = 2_500;
export const CWV_CLS_MAX = 0.1;
export const CWV_SUGGESTION_MS = 200;
export const CWV_FILTER_APPLY_MS = 1_000;
export const CWV_CORE_JS_BYTES = 300 * 1024;

/** Vite `npm run dev` cannot meet the 3s TTI gate under 4× CPU + 4G. Preview/prod sets E2E_CWV_STRICT=1. */
export function homepageInteractiveBudgetMs(
	env: NodeJS.ProcessEnv = process.env
): number {
	return env.E2E_CWV_STRICT === '1' ? CWV_HOMEPAGE_FCP_MS : 12_000;
}

export function profileNavigationBudgetMs(
	env: NodeJS.ProcessEnv = process.env
): number {
	return env.E2E_CWV_STRICT === '1' ? CWV_PROFILE_NAV_MS : 10_000;
}

export function suggestionRenderBudgetMs(
	env: NodeJS.ProcessEnv = process.env
): number {
	return env.E2E_CWV_STRICT === '1' ? CWV_SUGGESTION_MS : 2_000;
}

export function filterApplyBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
	return env.E2E_CWV_STRICT === '1' ? CWV_FILTER_APPLY_MS : 4_000;
}

export function coreJsPayloadBudgetBytes(
	env: NodeJS.ProcessEnv = process.env
): number {
	return env.E2E_CWV_STRICT === '1' ? CWV_CORE_JS_BYTES : 3 * 1024 * 1024;
}
