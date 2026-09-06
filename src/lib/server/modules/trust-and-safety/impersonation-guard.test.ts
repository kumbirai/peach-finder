import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ADMIN_ROOT = join(process.cwd(), 'src/routes/admin');

function collectSourceFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectSourceFiles(fullPath));
			continue;
		}
		if (
			entry.name.endsWith('.svelte') ||
			(entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
		) {
			files.push(fullPath);
		}
	}
	return files;
}

describe('US-ADMIN-05 impersonation guard', () => {
	it('TC-ADMIN-05b: admin console has no impersonation affordance in source', () => {
		const forbidden = [/createAdminSession\([^)]*targetUserId/i, /loginAs(?:User|Account)/i];
		const hits: string[] = [];

		for (const file of collectSourceFiles(ADMIN_ROOT)) {
			const source = readFileSync(file, 'utf8');
			for (const pattern of forbidden) {
				if (pattern.test(source)) {
					hits.push(`${file}: ${pattern}`);
				}
			}
		}

		expect(hits).toEqual([]);
	});
});
