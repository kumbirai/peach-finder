import { lookup } from 'node:dns/promises';

export interface FetchOptions {
	timeoutMs: number;
	retries?: { max: number; backoffMs: number };
	allowedHosts: string[];
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

export class UnsafeHostError extends Error {
	constructor(host: string) {
		super(`Outbound host not allowlisted: ${host}`);
		this.name = 'UnsafeHostError';
	}
}

export async function safeFetch(url: string, opts: FetchOptions): Promise<Response> {
	const parsed = new URL(url);
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		throw new UnsafeHostError(parsed.hostname);
	}
	if (!opts.allowedHosts.includes(parsed.hostname)) {
		throw new UnsafeHostError(parsed.hostname);
	}

	const resolved = await lookup(parsed.hostname, { all: true });
	for (const record of resolved) {
		if (isPrivateAddress(record.address)) {
			throw new UnsafeHostError(parsed.hostname);
		}
	}

	const attempts = 1 + (opts.retries?.max ?? 0);
	let lastError: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
			try {
				return await fetch(url, {
					method: opts.method ?? 'GET',
					...(opts.headers ? { headers: opts.headers } : {}),
					...(opts.body ? { body: opts.body } : {}),
					signal: controller.signal,
					redirect: 'manual'
				});
			} finally {
				clearTimeout(timer);
			}
		} catch (error) {
			lastError = error;
			if (i < attempts - 1 && opts.retries) {
				const backoffMs = opts.retries.backoffMs;
				await new Promise((resolve) => setTimeout(resolve, backoffMs));
			}
		}
	}
	throw lastError;
}

function isPrivateAddress(address: string): boolean {
	return (
		address === '127.0.0.1' ||
		address === '::1' ||
		address.startsWith('::ffff:127.') ||
		address.startsWith('10.') ||
		address.startsWith('192.168.') ||
		address.startsWith('169.254.') ||
		Boolean(address.match(/^172\.(1[6-9]|2\d|3[0-1])\./)) ||
		address.startsWith('fc') ||
		address.startsWith('fd')
	);
}
