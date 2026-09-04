import { getDb, closeDb } from '../src/lib/server/db';
import { seedPlatform, loadConfigCache } from '../src/lib/server/modules/platform-configuration';
import { seedCore } from './seed-core';

const db = getDb();
await seedPlatform(db);
await loadConfigCache(db);

if (process.env.SEED_PACK === 'seed-core' || process.env.SEED_CORE === '1') {
	await seedCore(db);
	console.info('seed-core complete');
} else {
	console.info('platform seed complete (set SEED_PACK=seed-core for browse fixtures)');
}

await closeDb();
