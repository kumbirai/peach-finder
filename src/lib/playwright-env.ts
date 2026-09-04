import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_E2E_PORT = 5173;

/** Load `.env` so the Playwright webServer subprocess gets DATABASE_URL when CI env is unset. */
export function loadDotEnv(path = '.env'): Record<string, string> {
	if (!existsSync(path)) return {};
	const env: Record<string, string> = {};
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
	}
	return env;
}

export function resolveE2ePort(raw = process.env.E2E_PORT): number {
	if (raw === undefined || raw === '') return DEFAULT_E2E_PORT;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid E2E_PORT "${raw}": must be an integer between 1 and 65535`);
	}
	return port;
}

export function resolveE2eBaseUrl(port: number, raw = process.env.E2E_BASE_URL): string {
	return raw ?? `http://127.0.0.1:${port}`;
}

export function buildWebServerCommand(port: number): string {
	return `npm run dev -- --host 127.0.0.1 --port ${port}`;
}
