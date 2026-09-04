import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
	const migration = readFileSync(path.resolve('drizzle/migrations/0000_foundation.sql'), 'utf8');
	await sql.unsafe(migration);
	const db = drizzle(sql, { schema });
	try {
		return await fn(db);
	} finally {
		await sql.end();
		await container.stop();
	}
}
