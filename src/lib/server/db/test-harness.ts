import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import * as schema from './schema';

export async function withTestDatabase<T>(
	fn: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>
): Promise<T> {
	let container;
	try {
		container = await new PostgreSqlContainer('postgres:17')
			.withDatabase('peach_finder')
			.withUsername('postgres')
			.withPassword('secret')
			.start();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Docker/testcontainers unavailable: ${message}`, { cause: error });
	}

	process.env.DATABASE_URL = container.getConnectionUri();
	const sql = postgres(container.getConnectionUri(), { max: 5 });
	await sql.unsafe(`
		DO $$
		BEGIN
		  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'peach_app') THEN
		    CREATE ROLE peach_app LOGIN PASSWORD 'secret';
		  END IF;
		END
		$$;
	`);
	const migrationDir = path.resolve('drizzle/migrations');
	const migrationFiles = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
	for (const file of migrationFiles) {
		const body = readFileSync(path.join(migrationDir, file), 'utf8');
		await sql.unsafe(body);
	}
	const db = drizzle(sql, { schema });
	try {
		return await fn(db);
	} finally {
		await sql.end();
		await container.stop();
	}
}
