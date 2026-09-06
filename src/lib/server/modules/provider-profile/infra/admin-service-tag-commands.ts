import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { newId, type ServiceTagId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { serviceTags } from './schema';

const MAX_TAG_NAME = 60;

function toServiceTagSlug(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

export async function listServiceTagsForAdmin(db: Database) {
	return db
		.select({
			id: serviceTags.id,
			name: serviceTags.name,
			slug: serviceTags.slug,
			isActive: serviceTags.isActive
		})
		.from(serviceTags)
		.orderBy(serviceTags.name);
}

export async function adminCreateServiceTag(
	db: Database,
	input: { name: string }
): Promise<Result<{ id: ServiceTagId }, UseCaseError>> {
	const trimmed = input.name.trim();
	if (!trimmed || trimmed.length > MAX_TAG_NAME) {
		return Err({
			kind: 'validation_failed',
			issues: [
				{
					path: 'name',
					message: `Tag name must be between 1 and ${MAX_TAG_NAME} characters.`
				}
			]
		});
	}
	const slug = toServiceTagSlug(trimmed);
	if (!slug) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'name', message: 'Enter a valid tag name.' }]
		});
	}
	const id = newId<'ServiceTagId'>();
	try {
		await db.insert(serviceTags).values({
			id,
			name: trimmed,
			slug,
			isActive: true,
			createdAt: new Date()
		});
	} catch {
		return Err({ kind: 'conflict', reason: 'That tag name or slug is already in use.' });
	}
	return Ok({ id });
}

export async function adminUpdateServiceTag(
	db: Database,
	input: { id: string; name: string }
): Promise<Result<{ id: string }, UseCaseError>> {
	const trimmed = input.name.trim();
	if (!trimmed || trimmed.length > MAX_TAG_NAME) {
		return Err({
			kind: 'validation_failed',
			issues: [
				{
					path: 'name',
					message: `Tag name must be between 1 and ${MAX_TAG_NAME} characters.`
				}
			]
		});
	}
	const rows = await db
		.select({ id: serviceTags.id })
		.from(serviceTags)
		.where(eq(serviceTags.id, input.id))
		.limit(1);
	if (!rows[0]) {
		return Err({ kind: 'not_found', resource: 'service_tag' });
	}
	await db.update(serviceTags).set({ name: trimmed }).where(eq(serviceTags.id, input.id));
	return Ok({ id: input.id });
}

export async function adminRetireServiceTag(
	db: Database,
	input: { id: string }
): Promise<Result<{ id: string }, UseCaseError>> {
	const rows = await db
		.select({ id: serviceTags.id })
		.from(serviceTags)
		.where(eq(serviceTags.id, input.id))
		.limit(1);
	if (!rows[0]) {
		return Err({ kind: 'not_found', resource: 'service_tag' });
	}
	await db.update(serviceTags).set({ isActive: false }).where(eq(serviceTags.id, input.id));
	return Ok({ id: input.id });
}
