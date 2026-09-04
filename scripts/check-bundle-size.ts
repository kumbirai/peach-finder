import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const BUDGET_BYTES = 300 * 1024;
const clientDir = path.resolve('build/client');

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, acc);
		else if (entry.name.endsWith('.js')) acc.push(full);
	}
	return acc;
}

if (!existsSync(clientDir)) {
	console.error('build/client missing — run npm run build first');
	process.exit(1);
}

const files = walk(clientDir);
let total = 0;
for (const file of files) {
	total += gzipSync(readFileSync(file)).length;
}
console.info(`compressed JS under build/client: ${total} bytes (budget ${BUDGET_BYTES})`);
if (total > BUDGET_BYTES) {
	console.error('SR-PERF-05 bundle budget exceeded');
	process.exit(1);
}
