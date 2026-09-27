import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isPublicMediaKey, writeFinalObject } from './storage';

const priorRoot = process.env.MEDIA_LOCAL_ROOT;
const priorEndpoint = process.env.MINIO_ENDPOINT;

afterEach(() => {
	if (priorRoot === undefined) delete process.env.MEDIA_LOCAL_ROOT;
	else process.env.MEDIA_LOCAL_ROOT = priorRoot;
	if (priorEndpoint === undefined) delete process.env.MINIO_ENDPOINT;
	else process.env.MINIO_ENDPOINT = priorEndpoint;
});

describe('public media keys', () => {
	it('denies identity-docs at the storage boundary', () => {
		expect(isPublicMediaKey('identity-docs/abc/id.jpg')).toBe(false);
		expect(isPublicMediaKey('hash/card_640.webp')).toBe(true);
		expect(isPublicMediaKey('../identity-docs/x')).toBe(false);
	});

	it('writes local bytes even when the object store is not configured', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'pf-media-'));
		process.env.MEDIA_LOCAL_ROOT = root;
		delete process.env.MINIO_ENDPOINT;
		const key = 'hash/card_640.webp';
		await writeFinalObject(key, Buffer.from('webp-bytes'));
		expect(await readFile(path.join(root, key), 'utf8')).toBe('webp-bytes');
	});
});

