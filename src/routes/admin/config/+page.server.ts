import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import type { Role } from '$lib/server/shared/auth-context';
import { SystemClock } from '$lib/server/shared/clock';
import {
	createLexiconEntry,
	listConfig,
	listLexicon,
	updateConfig,
	type ConfigKey
} from '$lib/server/modules/platform-configuration';
import {
	adminCreateServiceTag,
	adminRetireServiceTag,
	listServiceTagsForAdmin
} from '$lib/server/modules/provider-profile';
import { LEXICON_ENTRY_TYPES } from '$lib/server/modules/discovery-search';
import {
	CONFIG_FIELDS,
	CONFIG_SECTION_LABELS,
	defaultMapsToForLexiconType,
	parseConfigFormValue
} from '$lib/admin/platform-config-fields';

export const _requiredRole: Role = 'admin';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const [config, lexicon, serviceTags] = await Promise.all([
		listConfig(),
		listLexicon(db),
		listServiceTagsForAdmin(db)
	]);
	return {
		config,
		lexicon,
		serviceTags,
		configFields: CONFIG_FIELDS,
		configSections: CONFIG_SECTION_LABELS,
		lexiconEntryTypes: LEXICON_ENTRY_TYPES
	};
};

export const actions: Actions = {
	saveConfig: async ({ request, locals }) => {
		const form = await request.formData();
		const key = String(form.get('key') ?? '') as ConfigKey;
		const raw = String(form.get('value') ?? '');
		const parsed = parseConfigFormValue(key, raw);
		if (!parsed.ok) {
			return fail(422, { message: parsed.message, field: key });
		}

		const result = await updateConfig(getDb(), {
			key,
			value: parsed.value,
			actor: locals.auth,
			clock: new SystemClock(),
			correlationId: locals.correlationId
		});
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				const first = result.error.issues[0];
				return fail(422, {
					message: first?.message ?? 'That value could not be saved.',
					field: key
				});
			}
			return fail(422, { message: 'That value could not be saved.', field: key });
		}

		return { saved: true, key, value: result.value.value };
	},
	createServiceTag: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const result = await adminCreateServiceTag(getDb(), { name });
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, {
					message: result.error.issues[0]?.message ?? 'Could not add that tag.'
				});
			}
			if (result.error.kind === 'conflict') {
				return fail(409, { message: result.error.reason });
			}
			return fail(422, { message: 'Could not add that tag.' });
		}
		return { tagCreated: true, tagId: result.value.id };
	},
	retireServiceTag: async ({ request }) => {
		const form = await request.formData();
		const tagId = String(form.get('tagId') ?? '');
		const result = await adminRetireServiceTag(getDb(), { id: tagId });
		if (!result.ok) {
			return fail(422, { message: 'Could not retire that tag.' });
		}
		return { tagRetired: true, tagId };
	},
	createLexicon: async ({ request, locals }) => {
		const form = await request.formData();
		const term = String(form.get('term') ?? '').trim();
		const entryType = String(form.get('entryType') ?? '');
		const serviceTagId = String(form.get('serviceTagId') ?? '').trim();
		const languageCode = String(form.get('languageCode') ?? '').trim();
		const synonymOf = String(form.get('synonymOf') ?? '').trim();

		if (!term) {
			return fail(422, { message: 'Enter a lexicon term.' });
		}

		let mapsTo = defaultMapsToForLexiconType(entryType, serviceTagId || undefined);
		if (entryType === 'language') {
			mapsTo = { language: languageCode || 'en' };
		}
		if (entryType === 'synonym') {
			if (!synonymOf) {
				return fail(422, { message: 'Enter the canonical term this synonym maps to.' });
			}
			mapsTo = { of: synonymOf };
		}
		if (entryType === 'service_term' && !serviceTagId) {
			return fail(422, { message: 'Choose a service tag for this term.' });
		}

		const result = await createLexiconEntry(getDb(), {
			term,
			entryType,
			mapsTo,
			actor: locals.auth,
			correlationId: locals.correlationId
		});
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, {
					message: result.error.issues[0]?.message ?? 'Could not add that lexicon entry.'
				});
			}
			return fail(422, { message: 'Could not add that lexicon entry.' });
		}
		return { lexiconCreated: true, lexiconId: result.value.id };
	}
};
