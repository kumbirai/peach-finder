import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { publicAppOrigin } from '../../../env';

const STAGING_PREFIX = '_staging';

export function mediaPublicUrl(objectKey: string): string {
	return `${publicAppOrigin()}/media/${objectKey}`;
}

export function mediaLocalRoot(): string {
	return process.env.MEDIA_LOCAL_ROOT ?? path.join(process.cwd(), '.media-local');
}

function localPathForKey(objectKey: string): string {
	return path.join(mediaLocalRoot(), objectKey);
}

export async function writeStagingObject(stagingId: string, bytes: Buffer): Promise<string> {
	const key = `${STAGING_PREFIX}/${stagingId}`;
	const filePath = localPathForKey(key);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, bytes);
	return key;
}

export async function writeFinalObject(objectKey: string, bytes: Buffer): Promise<void> {
	const filePath = localPathForKey(objectKey);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, bytes);
}

export async function readStagingObject(stagingKey: string): Promise<Buffer> {
	return readFile(localPathForKey(stagingKey));
}

export async function deleteObject(objectKey: string): Promise<void> {
	try {
		await unlink(localPathForKey(objectKey));
	} catch {
		// idempotent
	}
}

export function sha256(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

export async function readLocalMediaFile(relativePath: string): Promise<Buffer | null> {
	try {
		return await readFile(localPathForKey(relativePath));
	} catch {
		return null;
	}
}
