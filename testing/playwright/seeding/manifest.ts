import fs from 'node:fs';
import path from 'node:path';
import type { SeededPersona } from './types';

/** Playwright workers run with cwd = `testing/playwright`. Unit tests set `SEED_MANIFEST_DIR`. */
export function manifestDir(): string {
	return process.env.SEED_MANIFEST_DIR || path.join(process.cwd(), 'seeding', '.out');
}

export function manifestPath(): string {
	return path.join(manifestDir(), 'seeded-personas.json');
}

export type SeedManifest = {
	updatedAt: string;
	personas: SeededPersona[];
};

export function emptyManifest(): SeedManifest {
	return { updatedAt: new Date().toISOString(), personas: [] };
}

export function readManifest(): SeedManifest {
	const file = manifestPath();
	if (!fs.existsSync(file)) return emptyManifest();
	try {
		const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SeedManifest;
		if (!Array.isArray(parsed.personas)) return emptyManifest();
		return parsed;
	} catch {
		return emptyManifest();
	}
}

export function upsertPersona(manifest: SeedManifest, persona: SeededPersona): SeedManifest {
	const next = manifest.personas.filter((row) => row.key !== persona.key);
	next.push(persona);
	return { updatedAt: new Date().toISOString(), personas: next };
}

export function writeManifest(manifest: SeedManifest): void {
	fs.mkdirSync(manifestDir(), { recursive: true });
	const next = { ...manifest, updatedAt: new Date().toISOString() };
	fs.writeFileSync(manifestPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function writePersona(persona: SeededPersona): SeedManifest {
	const next = upsertPersona(readManifest(), persona);
	writeManifest(next);
	return next;
}

export function requirePersona(key: string): SeededPersona {
	const found = readManifest().personas.find((row) => row.key === key);
	if (!found) {
		throw new Error(`Missing seeded persona "${key}". Run npm run test:seeding first.`);
	}
	return found;
}
