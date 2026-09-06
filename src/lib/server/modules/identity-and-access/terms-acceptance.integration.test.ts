import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { registerSeeker } from './infra/auth-commands';
import { registerProvider } from './infra/otp-commands';
import { termsAcceptance } from './infra/schema';
import { listTermsAcceptanceForUser } from './infra/terms-acceptance';
import { exportFor } from './infra/export-for';
import { LEGAL_DOCUMENT_VERSIONS } from './domain/legal-documents';

describe('US-PRIV-04 terms acceptance', () => {
	it('TC-PRIV-04b: seeker registration blocked without affirmative acceptance', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const result = await registerSeeker(
				db,
				{
					email: `no-terms-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'No Terms User',
					acceptedTerms: false
				},
				new Date(),
				'test-corr-priv-04b-seeker'
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe('validation_failed');
			if (result.error.kind !== 'validation_failed') return;
			expect(result.error.issues).toEqual([
				{ path: 'acceptedTerms', message: 'You must accept the terms.' }
			]);
		});
	});

	it('TC-PRIV-04b: provider registration blocked without affirmative acceptance', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const result = await registerProvider(
				db,
				{
					email: `no-terms-provider-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'No Terms Provider',
					phone: `+2784${String(Date.now()).slice(-7)}`,
					acceptedTerms: false
				},
				new Date(),
				'test-corr-priv-04b-provider'
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe('validation_failed');
			if (result.error.kind !== 'validation_failed') return;
			expect(result.error.issues.some((issue) => issue.path === 'acceptedTerms')).toBe(true);
		});
	});

	it('records accepted document versions when seeker registration succeeds', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const result = await registerSeeker(
				db,
				{
					email: `terms-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Terms User',
					acceptedTerms: true
				},
				now,
				'test-corr-priv-04-record'
			);

			expect(result.ok).toBe(true);
			if (!result.ok || !result.value.userId) return;

			const rows = await db
				.select()
				.from(termsAcceptance)
				.where(eq(termsAcceptance.userId, result.value.userId));

			expect(rows).toHaveLength(2);
			expect(rows.map((row) => row.documentSlug).sort()).toEqual([
				'privacy-policy',
				'terms-of-service'
			]);
			for (const row of rows) {
				expect(row.documentVersion).toBe(
					LEGAL_DOCUMENT_VERSIONS[row.documentSlug as keyof typeof LEGAL_DOCUMENT_VERSIONS]
				);
				expect(row.acceptedAt.getTime()).toBe(now.getTime());
			}

			const listed = await listTermsAcceptanceForUser(db, result.value.userId);
			expect(listed).toHaveLength(2);
			expect(listed.map((row) => row.documentSlug).sort()).toEqual([
				'privacy-policy',
				'terms-of-service'
			]);
		});
	});

	it('records accepted document versions when provider registration succeeds', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const result = await registerProvider(
				db,
				{
					email: `terms-provider-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Terms Provider',
					phone: `+2783${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-priv-04-provider-record'
			);

			expect(result.ok).toBe(true);
			if (!result.ok || !result.value.userId) return;

			const rows = await db
				.select()
				.from(termsAcceptance)
				.where(eq(termsAcceptance.userId, result.value.userId));

			expect(rows).toHaveLength(2);
		});
	});

	it('exportFor returns terms acceptance rows for subject-access export', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const result = await registerSeeker(
				db,
				{
					email: `export-terms-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Export Terms User',
					acceptedTerms: true
				},
				now,
				'test-corr-priv-04-export'
			);

			expect(result.ok).toBe(true);
			if (!result.ok || !result.value.userId) return;

			const exported = await exportFor(result.value.userId);
			expect(exported.termsAcceptance).toHaveLength(2);
			expect(exported.termsAcceptance.map((row) => row.documentSlug).sort()).toEqual([
				'privacy-policy',
				'terms-of-service'
			]);
		});
	});
});
