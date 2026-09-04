import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { databaseUrl } from '../env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

let client: Sql | undefined;
let dbInstance: Database | undefined;

export function getDb(): Database {
	if (!dbInstance) {
		client = postgres(databaseUrl(), { max: 10 });
		dbInstance = drizzle(client, { schema });
	}
	return dbInstance;
}

export async function closeDb(): Promise<void> {
	if (client) {
		await client.end();
		client = undefined;
		dbInstance = undefined;
	}
}
