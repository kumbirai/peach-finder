import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { migrateDatabaseUrl } from '../src/lib/server/env';

const dir = path.resolve('drizzle/migrations');

const sql = postgres(migrateDatabaseUrl(), { max: 1 });
try {
	const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
	for (const file of files) {
		const body = await readFile(path.join(dir, file), 'utf8');
		console.info(`applying ${file}`);
		await sql.unsafe(body);
	}
	console.info(`applied ${files.length} migration file(s)`);
} finally {
	await sql.end();
}
