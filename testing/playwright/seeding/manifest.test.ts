import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	emptyManifest,
	manifestPath,
	readManifest,
	upsertPersona,
	writeManifest,
	writePersona
} from './manifest';
import type { SeededPersona } from './types';

const sample: SeededPersona = {
	key: 'ui-seeker',
	role: 'seeker',
	displayName: 'UI Seed Seeker',
	email: 'ui-seeker@example.com',
	password: 'password123',
	completedJourneys: ['seeker-register'],
	partial: false
};

describe('seed manifest', () => {
	const dirs: string[] = [];

	afterEach(() => {
		delete process.env.SEED_MANIFEST_DIR;
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('upserts by key and round-trips JSON', () => {
		const dir = mkdtempSync(join(tmpdir(), 'pf-seed-manifest-'));
		dirs.push(dir);
		process.env.SEED_MANIFEST_DIR = dir;
		expect(readManifest().personas).toEqual([]);
		writePersona(sample);
		expect(readManifest().personas).toHaveLength(1);
		const updated = { ...sample, email: 'second@example.com' };
		writePersona(updated);
		const stored = readManifest();
		expect(stored.personas).toHaveLength(1);
		expect(stored.personas[0]?.email).toBe('second@example.com');
		expect(manifestPath()).toBe(join(dir, 'seeded-personas.json'));
		const merged = upsertPersona(emptyManifest(), sample);
		writeManifest(merged);
		expect(readManifest().personas[0]?.key).toBe('ui-seeker');
	});
});
