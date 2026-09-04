import { getDb } from './db';
import { loadConfigCache, maybeRefreshAll } from './modules/platform-configuration';
import { log } from './shared/logger';

let bootPromise: Promise<void> | null = null;

export function bootApp(): Promise<void> {
	bootPromise ??= (async () => {
		const db = getDb();
		await loadConfigCache(db);
		log('info', 'platform configuration cache loaded');
	})();
	return bootPromise;
}

export async function tickConfigRefresh(): Promise<void> {
	await maybeRefreshAll(getDb());
}
