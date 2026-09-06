import type { Database } from '../src/lib/server/db';
import { eq } from 'drizzle-orm';
import { seedCore } from './seed-core';
import { users } from '../src/lib/server/modules/identity-and-access/infra/schema';
import { threads } from '../src/lib/server/modules/direct-messaging/infra/schema';
import { reviews } from '../src/lib/server/modules/provider-reviews/infra/schema';
import { hashPassword } from '../src/lib/server/modules/identity-and-access/infra/password-hash';

export const SEED_REV_PROVIDER_PROFILE_ID = '01900000-0000-7000-8000-000000000103';

export const SEED_REV_INELIGIBLE_SEEKER_ID = '01900000-0000-7000-8000-00000000d101';
export const SEED_REV_INELIGIBLE_SEEKER_EMAIL = 'rev-ineligible@example.com';
export const SEED_REV_INELIGIBLE_SEEKER_PASSWORD = 'password123';
export const SEED_REV_INELIGIBLE_THREAD_ID = '01900000-0000-7000-8000-00000000d201';

export const SEED_REV_ELIGIBLE_SEEKER_ID = '01900000-0000-7000-8000-00000000d102';
export const SEED_REV_ELIGIBLE_SEEKER_EMAIL = 'rev-eligible@example.com';
export const SEED_REV_ELIGIBLE_SEEKER_PASSWORD = 'password123';
export const SEED_REV_ELIGIBLE_THREAD_ID = '01900000-0000-7000-8000-00000000d202';

export const SEED_REV_EXISTING_SEEKER_ID = '01900000-0000-7000-8000-00000000d103';
export const SEED_REV_EXISTING_SEEKER_EMAIL = 'rev-existing@example.com';
export const SEED_REV_EXISTING_SEEKER_PASSWORD = 'password123';
export const SEED_REV_EXISTING_THREAD_ID = '01900000-0000-7000-8000-00000000d203';
export const SEED_REV_EXISTING_REVIEW_ID = '01900000-0000-7000-8000-00000000d301';

export const SEED_REV_INELIGIBLE_REASON = "You can review after you've been in contact for a day.";

const HOUR_MS = 60 * 60 * 1000;

export async function seedReviews(db: Database): Promise<void> {
	await seedCore(db);

	const now = new Date();
	const ineligibleCreatedAt = new Date(now.getTime() - 12 * HOUR_MS);
	const eligibleCreatedAt = new Date(now.getTime() - 48 * HOUR_MS);
	const existingCreatedAt = new Date(now.getTime() - 72 * HOUR_MS);

	const passwordHash = await hashPassword(SEED_REV_INELIGIBLE_SEEKER_PASSWORD);

	const seekers = [
		{
			id: SEED_REV_INELIGIBLE_SEEKER_ID,
			email: SEED_REV_INELIGIBLE_SEEKER_EMAIL,
			displayName: 'Ineligible Reviewer'
		},
		{
			id: SEED_REV_ELIGIBLE_SEEKER_ID,
			email: SEED_REV_ELIGIBLE_SEEKER_EMAIL,
			displayName: 'Eligible Reviewer'
		},
		{
			id: SEED_REV_EXISTING_SEEKER_ID,
			email: SEED_REV_EXISTING_SEEKER_EMAIL,
			displayName: 'Existing Reviewer'
		}
	];

	for (const seeker of seekers) {
		await db
			.insert(users)
			.values({
				id: seeker.id,
				displayName: seeker.displayName,
				email: seeker.email,
				emailVerifiedAt: new Date('2026-08-01T10:00:00Z'),
				passwordHash,
				status: 'active'
			})
			.onConflictDoUpdate({
				target: users.id,
				set: {
					displayName: seeker.displayName,
					email: seeker.email,
					passwordHash,
					status: 'active'
				}
			});
	}

	await db.delete(reviews).where(eq(reviews.providerProfileId, SEED_REV_PROVIDER_PROFILE_ID));

	await db.delete(threads).where(eq(threads.providerProfileId, SEED_REV_PROVIDER_PROFILE_ID));

	await db.insert(threads).values([
		{
			id: SEED_REV_INELIGIBLE_THREAD_ID,
			seekerId: SEED_REV_INELIGIBLE_SEEKER_ID,
			providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
			createdAt: ineligibleCreatedAt,
			lastActivityAt: ineligibleCreatedAt
		},
		{
			id: SEED_REV_ELIGIBLE_THREAD_ID,
			seekerId: SEED_REV_ELIGIBLE_SEEKER_ID,
			providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
			createdAt: eligibleCreatedAt,
			lastActivityAt: eligibleCreatedAt
		},
		{
			id: SEED_REV_EXISTING_THREAD_ID,
			seekerId: SEED_REV_EXISTING_SEEKER_ID,
			providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
			createdAt: existingCreatedAt,
			lastActivityAt: existingCreatedAt
		}
	]);

	await db.insert(reviews).values({
		id: SEED_REV_EXISTING_REVIEW_ID,
		providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
		reviewerId: SEED_REV_EXISTING_SEEKER_ID,
		rating: 4,
		body: 'Already reviewed this provider.',
		createdAt: existingCreatedAt
	});
}
