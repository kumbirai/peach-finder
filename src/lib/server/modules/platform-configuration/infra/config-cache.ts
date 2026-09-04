import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { config } from './schema';
import {
	CONFIG_KEYS,
	ConfigRegistry,
	validateCrossKeys,
	type ConfigKey,
	type ConfigValue
} from '../domain/config-registry';

export class ConfigBootError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigBootError';
	}
}

const cache = new Map<ConfigKey, unknown>();
let loaded = false;
let lastFullRefreshAt = 0;
const TTL_MS = 5 * 60_000;

export function isConfigCacheLoaded(): boolean {
	return loaded;
}

export function getConfig<K extends ConfigKey>(key: K): ConfigValue<K> {
	if (!loaded) {
		throw new ConfigBootError(`config cache not loaded (reading ${key})`);
	}
	if (!cache.has(key)) {
		throw new ConfigBootError(`missing config key ${key}`);
	}
	return cache.get(key) as ConfigValue<K>;
}

export async function loadConfigCache(db: Database): Promise<void> {
	const snapshot: Partial<{ [K in ConfigKey]: ConfigValue<K> }> = {};
	for (const key of CONFIG_KEYS) {
		const rows = await db.select().from(config).where(eq(config.key, key)).limit(1);
		const row = rows[0];
		if (!row) {
			throw new ConfigBootError(`missing config key ${key}`);
		}
		const parsed = ConfigRegistry[key].safeParse(row.value);
		if (!parsed.success) {
			throw new ConfigBootError(`malformed config ${key}: ${parsed.error.message}`);
		}
		snapshot[key] = parsed.data as never;
		cache.set(key, parsed.data);
	}
	const issues = validateCrossKeys(snapshot as { [K in ConfigKey]: ConfigValue<K> });
	if (issues.length > 0) {
		throw new ConfigBootError(`cross-key config invalid: ${issues[0]?.message}`);
	}
	loaded = true;
	lastFullRefreshAt = Date.now();
}

export async function refreshConfigKey(db: Database, key: ConfigKey): Promise<void> {
	const rows = await db.select().from(config).where(eq(config.key, key)).limit(1);
	const row = rows[0];
	if (!row) throw new ConfigBootError(`missing config key ${key}`);
	const parsed = ConfigRegistry[key].safeParse(row.value);
	if (!parsed.success) {
		throw new ConfigBootError(`malformed config ${key}: ${parsed.error.message}`);
	}
	cache.set(key, parsed.data);
}

export async function maybeRefreshAll(db: Database, nowMs = Date.now()): Promise<void> {
	if (!loaded || nowMs - lastFullRefreshAt >= TTL_MS) {
		await loadConfigCache(db);
	}
}

export function resetConfigCacheForTests(): void {
	cache.clear();
	loaded = false;
	lastFullRefreshAt = 0;
}
