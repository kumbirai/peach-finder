import { getDb, closeDb } from '../src/lib/server/db';
import { seedPlatform, loadConfigCache } from '../src/lib/server/modules/platform-configuration';
import { seedCore } from './seed-core';
import { seedAvailability } from './seed-availability';

const db = getDb();
await seedPlatform(db);
await loadConfigCache(db);

if (process.env.SEED_PACK === 'seed-availability') {
	await seedAvailability(db);
	console.info('seed-availability complete');
} else if (process.env.SEED_PACK === 'seed-core' || process.env.SEED_CORE === '1') {
	await seedCore(db);
	console.info('seed-core complete');
} else if (process.env.SEED_PACK === 'seed-blocking') {
	const { seedBlocking } = await import('./seed-blocking');
	await seedBlocking(db);
	console.info('seed-blocking complete');
} else if (process.env.SEED_PACK === 'seed-verification') {
	const { seedVerification } = await import('./seed-verification');
	await seedVerification(db);
	console.info('seed-verification complete');
} else {
	console.info(
		'platform seed complete (set SEED_PACK=seed-core or seed-availability for browse fixtures)'
	);
}

await closeDb();
