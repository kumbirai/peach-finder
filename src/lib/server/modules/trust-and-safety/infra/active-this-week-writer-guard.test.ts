import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../../../../../..');

const ALLOWED_ACTIVE_THIS_WEEK_TRUE_WRITERS = new Set([
	'src/lib/server/modules/trust-and-safety/infra/active-this-week-job.ts',
	'scripts/seed-core.ts',
	'src/lib/server/modules/trust-and-safety/infra/identity-change-subscription.ts'
]);

const ACTIVE_THIS_WEEK_TRUE_PATTERN = /activeThisWeek:\s*true|active_this_week['"]?\s*:\s*true/;

function walkTsFiles(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			if (entry === 'node_modules' || entry === '.git') continue;
			walkTsFiles(full, acc);
			continue;
		}
		if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.e2e.ts')) {
			acc.push(full);
		}
	}
	return acc;
}

describe('US-AVAIL-04 active_this_week writer guard', () => {
	it('only the daily job (and seed/legacy migration) may set activeThisWeek to true', () => {
		const offenders: string[] = [];

		for (const file of walkTsFiles(REPO_ROOT)) {
			const rel = file.slice(REPO_ROOT.length + 1);
			if (rel.startsWith('drizzle/')) continue;
			const content = readFileSync(file, 'utf8');
			if (!ACTIVE_THIS_WEEK_TRUE_PATTERN.test(content)) continue;
			if (!ALLOWED_ACTIVE_THIS_WEEK_TRUE_WRITERS.has(rel)) {
				offenders.push(rel);
			}
		}

		expect(offenders).toEqual([]);
	});
});
