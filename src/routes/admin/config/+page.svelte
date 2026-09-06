<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import {
		CONFIG_SECTION_LABELS,
		LEXICON_ENTRY_TYPE_LABELS,
		configValueToFormString,
		type ConfigFieldMeta,
		type ConfigSectionId
	} from '$lib/admin/platform-config-fields';

	let { data, form } = $props();

	let newTagName = $state('');
	let lexiconTerm = $state('');
	let lexiconEntryType = $state('service_term');
	let lexiconServiceTagId = $state('');
	let lexiconLanguageCode = $state('en');
	let lexiconSynonymOf = $state('');
	let savingKey = $state<string | null>(null);

	const configByKey = $derived(new Map(data.config.map((row) => [row.key, row])));

	function fieldValue(field: ConfigFieldMeta): string {
		const row = configByKey.get(field.key);
		return configValueToFormString(field.key, row?.value);
	}

	function fieldsForSection(section: ConfigSectionId): ConfigFieldMeta[] {
		return data.configFields.filter((field) => field.section === section);
	}

	function sectionKeys(): ConfigSectionId[] {
		return Object.keys(CONFIG_SECTION_LABELS) as ConfigSectionId[];
	}

	function formatLexiconMapsTo(entry: (typeof data.lexicon)[number]): string {
		return JSON.stringify(entry.mapsTo);
	}

	function activeServiceTags() {
		return data.serviceTags.filter((tag) => tag.isActive);
	}
</script>

<main class="admin-panel admin-panel--top" data-testid="admin-platform-config">
	<h1 class="headline">Platform config</h1>
	<p class="body intro">
		Runtime settings, service-tag vocabulary, and search lexicon — effective within five minutes, no
		deploy required.
	</p>

	{#if form?.message}
		<p class="form-message" role="alert">{form.message}</p>
	{/if}
	{#if form?.saved}
		<p class="form-message form-message--success" role="status" data-testid="config-save-success">
			Saved {form.key}.
		</p>
	{/if}
	{#if form?.tagCreated}
		<p class="form-message form-message--success" role="status">Service tag added.</p>
	{/if}
	{#if form?.tagRetired}
		<p class="form-message form-message--success" role="status">Service tag retired.</p>
	{/if}
	{#if form?.lexiconCreated}
		<p class="form-message form-message--success" role="status">Lexicon entry added.</p>
	{/if}

	{#each sectionKeys() as section (section)}
		<section class="config-section" aria-labelledby={`section-${section}`}>
			<h2 class="section-title" id={`section-${section}`}>{CONFIG_SECTION_LABELS[section]}</h2>
			<div class="config-grid">
				{#each fieldsForSection(section) as field (field.key)}
					<form
						class="config-card"
						method="POST"
						action="?/saveConfig"
						data-testid={`config-field-${field.key}`}
						use:enhance={() => {
							savingKey = field.key;
							return async ({ update }) => {
								await update();
								savingKey = null;
							};
						}}
					>
						<input type="hidden" name="key" value={field.key} />
						<div class="config-card__header">
							<h3 class="config-card__label">{field.label}</h3>
							{#if field.readOnly}
								<span class="status-chip">Read-only</span>
							{/if}
						</div>
						<p class="config-card__key">{field.key}</p>
						{#if field.help}
							<p class="config-card__help">{field.help}</p>
						{/if}

						{#if field.inputType === 'textarea'}
							<label class="textarea-label" for={`value-${field.key}`}>{field.label}</label>
							<textarea
								id={`value-${field.key}`}
								class="textarea"
								name="value"
								rows="5"
								disabled={field.readOnly}
								value={fieldValue(field)}></textarea>
						{:else}
							<Input
								id={`value-${field.key}`}
								name="value"
								label={field.label}
								type="text"
								value={fieldValue(field)}
								disabled={Boolean(field.readOnly)}
								error={form?.field === field.key ? (form.message ?? '') : ''}
							/>
						{/if}

						{#if !field.readOnly}
							<div class="config-card__actions">
								<Button type="submit" variant="secondary" disabled={savingKey === field.key}>
									{savingKey === field.key ? 'Saving…' : 'Save'}
								</Button>
							</div>
						{/if}
					</form>
				{/each}
			</div>
		</section>
	{/each}

	<section class="config-section" aria-labelledby="section-service-tags">
		<h2 class="section-title" id="section-service-tags">Service tag vocabulary</h2>
		<p class="body section-intro">
			Curated tags providers can select. Retiring a tag hides it from new selections without
			breaking existing profiles.
		</p>

		<form
			class="inline-form"
			method="POST"
			action="?/createServiceTag"
			data-testid="service-tag-create"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success' && result.data?.tagCreated) {
						newTagName = '';
					}
				};
			}}
		>
			<Input
				id="new-service-tag"
				name="name"
				label="New service tag"
				placeholder="e.g. Prenatal massage"
				bind:value={newTagName}
			/>
			<div class="inline-form__actions">
				<Button type="submit" variant="secondary">Add tag</Button>
			</div>
		</form>

		<ul class="tag-list" data-testid="service-tag-list">
			{#each data.serviceTags as tag (tag.id)}
				<li class="tag-row" data-testid="service-tag-item" data-tag-id={tag.id}>
					<div>
						<span class="tag-row__name">{tag.name}</span>
						<span class="tag-row__slug"> · {tag.slug}</span>
					</div>
					{#if tag.isActive}
						<form
							method="POST"
							action="?/retireServiceTag"
							use:enhance
							data-testid="service-tag-retire"
						>
							<input type="hidden" name="tagId" value={tag.id} />
							<Button type="submit" variant="ghost" ariaLabel={`Retire ${tag.name}`}>Retire</Button>
						</form>
					{:else}
						<span class="status-chip">Retired</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section class="config-section" aria-labelledby="section-lexicon">
		<h2 class="section-title" id="section-lexicon">Search lexicon</h2>
		<p class="body section-intro">
			Natural-language phrases mapped to structured search intents. Changes apply without a deploy.
		</p>

		<form
			class="lexicon-form"
			method="POST"
			action="?/createLexicon"
			data-testid="lexicon-create"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success' && result.data?.lexiconCreated) {
						lexiconTerm = '';
						lexiconSynonymOf = '';
					}
				};
			}}
		>
			<Input
				id="lexicon-term"
				name="term"
				label="Surface term"
				placeholder="e.g. deep tissue"
				bind:value={lexiconTerm}
			/>
			<div class="field">
				<label class="label" for="lexicon-entry-type">Entry type</label>
				<select
					id="lexicon-entry-type"
					class="select"
					name="entryType"
					bind:value={lexiconEntryType}
				>
					{#each data.lexiconEntryTypes as entryType (entryType)}
						<option value={entryType}>{LEXICON_ENTRY_TYPE_LABELS[entryType] ?? entryType}</option>
					{/each}
				</select>
			</div>

			{#if lexiconEntryType === 'service_term'}
				<div class="field">
					<label class="label" for="lexicon-service-tag">Maps to service tag</label>
					<select
						id="lexicon-service-tag"
						class="select"
						name="serviceTagId"
						bind:value={lexiconServiceTagId}
					>
						<option value="">Choose a tag</option>
						{#each activeServiceTags() as tag (tag.id)}
							<option value={tag.id}>{tag.name}</option>
						{/each}
					</select>
				</div>
			{:else if lexiconEntryType === 'language'}
				<Input
					id="lexicon-language"
					name="languageCode"
					label="Language code"
					placeholder="en"
					bind:value={lexiconLanguageCode}
				/>
			{:else if lexiconEntryType === 'synonym'}
				<Input
					id="lexicon-synonym-of"
					name="synonymOf"
					label="Canonical term"
					placeholder="deep tissue"
					bind:value={lexiconSynonymOf}
				/>
			{/if}

			<div class="inline-form__actions">
				<Button type="submit" variant="secondary">Add lexicon entry</Button>
			</div>
		</form>

		<ul class="lexicon-list" data-testid="lexicon-list">
			{#each data.lexicon.filter((entry) => entry.isActive) as entry (entry.id)}
				<li class="lexicon-row" data-testid="lexicon-item" data-entry-id={entry.id}>
					<div>
						<span class="lexicon-row__term">{entry.term}</span>
						<span class="lexicon-row__meta">
							· {LEXICON_ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType} ·
							{formatLexiconMapsTo(entry)}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</main>

<style>
	.admin-panel {
		padding: 0 var(--space-lg) var(--space-xl);
	}

	.admin-panel--top {
		padding-top: var(--space-lg);
	}

	.headline {
		font-family: var(--font-display-family);
		font-size: var(--font-headline-size);
	}

	.body {
		margin-top: var(--space-sm);
		color: var(--color-stone);
	}

	.intro,
	.section-intro {
		max-width: 42rem;
	}

	.form-message {
		margin-top: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-blush);
		color: var(--color-ink);
	}

	.form-message--success {
		background: color-mix(in srgb, var(--color-pine) 12%, var(--color-paper));
	}

	.config-section {
		margin-top: var(--space-xl);
	}

	.section-title {
		font-family: var(--font-title-family);
		font-size: var(--font-title-size);
		font-weight: var(--font-title-weight);
	}

	.section-intro {
		margin-top: var(--space-xs);
	}

	.config-grid {
		margin-top: var(--space-md);
		display: grid;
		gap: var(--space-md);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
	}

	.config-card {
		background: var(--color-paper);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		box-shadow: var(--shadow-rest);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.config-card__header {
		display: flex;
		justify-content: space-between;
		gap: var(--space-sm);
		align-items: flex-start;
	}

	.config-card__label {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.config-card__key {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-stone);
		font-family: monospace;
	}

	.config-card__help {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-stone);
	}

	.config-card__actions,
	.inline-form__actions {
		margin-top: var(--space-xs);
		display: flex;
		gap: var(--space-sm);
	}

	.status-chip {
		flex-shrink: 0;
		border-radius: 999px;
		padding: 6px 12px;
		font-size: 0.75rem;
		font-weight: 700;
		background: var(--color-divider);
		color: var(--color-ink);
		white-space: nowrap;
	}

	.inline-form,
	.lexicon-form {
		margin-top: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		max-width: 28rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.label {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		color: var(--color-ink);
	}

	.select {
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: 16px var(--space-md);
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		min-height: 48px;
	}

	.select:focus {
		border: 2px solid var(--color-peach-deep);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}

	.textarea-label {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		color: var(--color-ink);
	}

	.textarea {
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		min-height: 8rem;
		resize: vertical;
	}

	.textarea:focus {
		border: 2px solid var(--color-peach-deep);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}

	.tag-list,
	.lexicon-list {
		margin-top: var(--space-md);
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.tag-row,
	.lexicon-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-paper);
		box-shadow: var(--shadow-rest);
		min-height: 44px;
	}

	.tag-row__name,
	.lexicon-row__term {
		font-weight: 600;
	}

	.tag-row__slug,
	.lexicon-row__meta {
		color: var(--color-stone);
		font-size: 0.875rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.config-card,
		.tag-row,
		.lexicon-row {
			transition: none;
		}
	}
</style>
