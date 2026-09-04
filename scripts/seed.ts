import { getDb, closeDb } from '../src/lib/server/db';
import { seedPlatform, loadConfigCache } from '../src/lib/server/modules/platform-configuration';

const db = getDb();
await seedPlatform(db);
await loadConfigCache(db);
await closeDb();
console.info('platform seed complete');
