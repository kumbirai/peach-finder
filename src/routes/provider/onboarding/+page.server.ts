import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId } from '$lib/server/shared/ids';
import { listAreas } from '$lib/server/modules/platform-configuration';
import {
	addService,
	loadOwnerProfile,
	listActiveLanguages,
	listActiveServiceTags,
	proposeServiceTag,
	setLanguages,
	setServiceTags,
	updateArea,
	updateIntro,
	ONBOARDING_STEPS,
	formatMissingFields,
	type OnboardingStep,
	type OwnerProfileDto
} from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

function parseStep(raw: string | null, profile: OwnerProfileDto): OnboardingStep {
	if (raw && ONBOARDING_STEPS.includes(raw as OnboardingStep)) {
		return raw as OnboardingStep;
	}
	return profile.onboarding.currentStep;
}

export async function load({ locals, url }) {
	const db = getDb();
	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	if (!profile) {
		redirect(303, '/provider/register');
	}

	const [areas, languages, serviceTags] = await Promise.all([
		listAreas(db),
		listActiveLanguages(db),
		listActiveServiceTags(db)
	]);

	const activeStep = parseStep(url.searchParams.get('step'), profile);
	const missingSummary = profile.readiness.ready
		? ''
		: formatMissingFields(profile.readiness.missing);
	const proposedTagName = url.searchParams.get('proposedTag');
	const proposalFlash =
		url.searchParams.get('proposal') === 'ok' && proposedTagName
			? `“${proposedTagName}” submitted for review. You can keep building your profile.`
			: null;

	return {
		profile,
		activeStep,
		missingSummary,
		proposalFlash,
		areas: areas
			.filter((a) => a.isActive)
			.map((a) => ({ id: a.id, name: a.name }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		languages,
		serviceTags
	};
}

export const actions: Actions = {
	saveIntro: async ({ request, locals }) => {
		const db = getDb();
		const data = await request.formData();
		const intro = String(data.get('intro') ?? '');
		const result = await updateIntro(
			db,
			locals.auth.userId!,
			intro,
			crypto.randomUUID(),
			new Date()
		);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues, intro });
			}
			return fail(400, { message: 'Could not save introduction.' });
		}
		redirect(303, '/provider/onboarding?step=services');
	},

	saveService: async ({ request, locals }) => {
		const db = getDb();
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const durationMinutes = Number(data.get('durationMinutes') ?? 0);
		const priceRands = Number(data.get('priceRands') ?? 0);
		const priceCents = Math.round(priceRands * 100);
		const tagIds = data.getAll('tagIds').map(String);

		const result = await addService(
			db,
			locals.auth.userId!,
			{ name, durationMinutes, priceCents },
			crypto.randomUUID(),
			new Date()
		);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, {
					issues: result.error.issues,
					name,
					durationMinutes: String(durationMinutes),
					priceRands: String(priceRands)
				});
			}
			return fail(400, { message: 'Could not save service.' });
		}

		const tagsResult = await setServiceTags(
			db,
			locals.auth.userId!,
			tagIds,
			crypto.randomUUID(),
			new Date()
		);
		if (!tagsResult.ok) {
			return fail(400, { message: 'Could not save service tags.' });
		}

		redirect(303, '/provider/onboarding?step=languages');
	},

	saveLanguages: async ({ request, locals }) => {
		const db = getDb();
		const data = await request.formData();
		const codes = data.getAll('codes').map(String);
		const result = await setLanguages(
			db,
			locals.auth.userId!,
			codes,
			crypto.randomUUID(),
			new Date()
		);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues, codes });
			}
			return fail(400, { message: 'Could not save languages.' });
		}
		redirect(303, '/provider/onboarding?step=area');
	},

	saveArea: async ({ request, locals }) => {
		const db = getDb();
		const data = await request.formData();
		const areaId = String(data.get('areaId') ?? '');
		try {
			const result = await updateArea(
				db,
				locals.auth.userId!,
				asId<'AreaId'>(areaId),
				crypto.randomUUID(),
				new Date()
			);
			if (!result.ok) {
				return fail(400, { message: 'Could not save area.' });
			}
		} catch {
			return fail(422, { issues: [{ path: 'areaId', message: 'Select a valid area.' }] });
		}
		redirect(303, '/provider/onboarding?step=publish');
	},

	proposeTag: async ({ request, locals }) => {
		const db = getDb();
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const result = await proposeServiceTag(db, locals.auth.userId!, name);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, {
					issues: result.error.issues,
					proposalName: name,
					proposalMessage: 'Enter a tag name up to 60 characters.'
				});
			}
			return fail(400, { proposalMessage: 'Could not submit that tag proposal. Try again.' });
		}
		const trimmed = name.trim();
		redirect(
			303,
			`/provider/onboarding?step=services&proposal=ok&proposedTag=${encodeURIComponent(trimmed)}`
		);
	}
};
