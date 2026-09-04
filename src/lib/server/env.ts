export function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is not set`);
	}
	return value;
}

export function databaseUrl(): string {
	return requiredEnv('DATABASE_URL');
}

export function migrateDatabaseUrl(): string {
	return process.env.DATABASE_URL_MIGRATE ?? databaseUrl();
}

export function publicAppOrigin(): string {
	return process.env.PUBLIC_APP_ORIGIN ?? 'http://127.0.0.1:5173';
}
