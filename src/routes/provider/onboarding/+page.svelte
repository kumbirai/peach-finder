<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import OnboardingStepper from '$lib/components/onboarding/OnboardingStepper.svelte';
	import PhotoUploader from '$lib/components/onboarding/PhotoUploader.svelte';
	import StepTip from '$lib/components/onboarding/StepTip.svelte';
	import { RESPONSE_TIME_DISCLOSURE_ONBOARDING } from '$lib/messaging/response-time-disclosure';

	const INTRO_LIMIT = 600;

	type OnboardingStep = 'photos' | 'intro' | 'services' | 'languages' | 'area' | 'publish';
	type AreaOption = { id: string; name: string };
	type LanguageOption = { code: string; name: string };
	type TagOption = { id: string; name: string; slug: string };

	let {
		data,
		form
	}: {
		data: {
			profile: {
				intro: string | null;
				areaId: string | null;
				areaName: string | null;
				readiness: { ready: boolean };
				onboarding: {
					steps: Array<{ step: OnboardingStep; complete: boolean }>;
				};
				photos: Array<{ id: string; photoId: string; isPrimary: boolean; cardUrl: string }>;
				services: Array<{
					name: string;
					durationMinutes: number;
					priceCents: number;
				}>;
				languageCodes: string[];
				selectedTagIds: string[];
			};
			activeStep: OnboardingStep;
			missingSummary: string;
			proposalFlash: string | null;
			areas: AreaOption[];
			languages: LanguageOption[];
			serviceTags: TagOption[];
		};
		form?: {
			issues?: Array<{ path: string; message: string }>;
			intro?: string;
			message?: string;
			proposalMessage?: string;
			proposalName?: string;
		};
	} = $props();

	let activeStep = $derived(data.activeStep);
	let introValue = $state('');
	let serviceName = $state('');
	let durationMinutes = $state('60');
	let priceRands = $state('');
	let selectedAreaId = $state('');
	let selectedTags = $state<string[]>([]);
	let proposedTag = $state('');
	let proposalMessage = $state<string | null>(null);

	$effect(() => {
		proposalMessage = data.proposalFlash;
		if (form?.intro !== undefined) {
			introValue = form.intro;
			return;
		}
		if (form?.proposalMessage !== undefined) {
			proposalMessage = form.proposalMessage;
		}
		if (form?.proposalName !== undefined) {
			proposedTag = form.proposalName;
		}
		if (activeStep === 'intro') {
			introValue = data.profile.intro ?? '';
		}
		if (activeStep === 'area') {
			selectedAreaId = data.profile.areaId ?? data.areas[0]?.id ?? '';
		}
		if (activeStep === 'services') {
			selectedTags = [...data.profile.selectedTagIds];
		}
	});

	const completedEssentials = $derived(
		data.profile.onboarding.steps.filter((s) => s.complete && s.step !== 'publish').length
	);
	const introLength = $derived(
		activeStep === 'intro' ? introValue.length : (data.profile.intro ?? '').length
	);

	function selectStep(step: OnboardingStep) {
		goto(`/provider/onboarding?step=${step}`);
	}

	function goBack() {
		const index = data.profile.onboarding.steps.findIndex((s) => s.step === activeStep);
		if (index > 0) {
			const prior = data.profile.onboarding.steps[index - 1];
			if (prior) selectStep(prior.step);
		}
	}

	function toggleTag(id: string) {
		selectedTags = selectedTags.includes(id)
			? selectedTags.filter((t) => t !== id)
			: [...selectedTags, id];
	}

	function formatPrice(cents: number): string {
		return `R${(cents / 100).toFixed(0)}`;
	}

	async function refreshProfile() {
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Set up your profile — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page">
	<h1 class="display">Set up your profile</h1>
	<p class="body intro">
		{completedEssentials} of 5 essentials complete. Pick up where you left off — your progress is saved.
	</p>

	<div class="progress-track" aria-hidden="true">
		<div class="progress-fill" style:width={`${(completedEssentials / 5) * 100}%`}></div>
	</div>

	<div class="onboarding-shell">
		<OnboardingStepper
			steps={data.profile.onboarding.steps}
			currentStep={activeStep}
			onSelect={selectStep}
		/>

		<div class="step-content">
			{#if form?.message}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}

			{#if activeStep === 'photos'}
				<h2 class="headline step-title">Add your photos</h2>
				<StepTip>
					Profiles with 3 or more photos get noticeably more messages. Use good natural light, no
					filters, and show your actual treatment space — it is what makes a seeker comfortable
					messaging first.
				</StepTip>
				<PhotoUploader photos={data.profile.photos} onUploaded={refreshProfile} />
				<div class="onboarding-actions">
					<span></span>
					{#if data.profile.photos.length > 0}
						<Button variant="primary" href="/provider/onboarding?step=intro">Continue</Button>
					{/if}
				</div>
			{:else if activeStep === 'intro'}
				<h2 class="headline step-title">Write your introduction</h2>
				<StepTip>
					Mention your specialties and what a session with you feels like. "8 years treating sports
					injuries, calm and focused sessions" tells a seeker more than "experienced and
					professional."
				</StepTip>
				<form method="POST" action="?/saveIntro" class="step-form">
					<label class="field-label" for="introField">Short introduction</label>
					<textarea
						class="field-textarea"
						id="introField"
						name="intro"
						maxlength={INTRO_LIMIT}
						bind:value={introValue}
						required></textarea>
					<div class="char-counter label" aria-live="polite">
						<span>{introLength}</span> / {INTRO_LIMIT}
					</div>
					{#if form?.issues}
						{#each form.issues as issue (issue.path)}
							<p class="form-error" role="alert">{issue.message}</p>
						{/each}
					{/if}
					<div class="onboarding-actions">
						<Button variant="ghost" type="button" onclick={goBack}>Back</Button>
						<Button variant="primary" type="submit">Continue</Button>
					</div>
				</form>
			{:else if activeStep === 'services'}
				<h2 class="headline step-title">Add your services</h2>
				<StepTip>
					Each service needs a duration and a price so seekers can compare at a glance. You need at
					least one to publish.
				</StepTip>
				{#if data.profile.services.length > 0}
					<ul class="saved-services">
						{#each data.profile.services as service (service.name)}
							<li class="body">
								{service.name} — {service.durationMinutes} min — {formatPrice(service.priceCents)}
							</li>
						{/each}
					</ul>
				{/if}
				<form id="saveServiceForm" method="POST" action="?/saveService" class="step-form">
					<div class="service-row">
						<div>
							<label class="field-label" for="serviceName">Service name</label>
							<input
								class="field-input"
								id="serviceName"
								name="name"
								bind:value={serviceName}
								required
							/>
						</div>
						<div>
							<label class="field-label" for="durationMinutes">Duration (minutes)</label>
							<input
								class="field-input"
								id="durationMinutes"
								name="durationMinutes"
								type="number"
								min="1"
								max="600"
								bind:value={durationMinutes}
								required
							/>
						</div>
						<div>
							<label class="field-label" for="priceRands">Price (Rands)</label>
							<input
								class="field-input"
								id="priceRands"
								name="priceRands"
								type="number"
								min="0"
								step="1"
								bind:value={priceRands}
								required
							/>
						</div>
					</div>
					<p class="field-label">Service tags</p>
					<div class="chip-row">
						{#each data.serviceTags as tag (tag.id)}
							<Chip selected={selectedTags.includes(tag.id)} onclick={() => toggleTag(tag.id)}>
								{tag.name}
							</Chip>
						{/each}
					</div>
					{#each selectedTags as tagId (tagId)}
						<input type="hidden" name="tagIds" value={tagId} />
					{/each}
				</form>
				<form method="POST" action="?/proposeTag" class="proposal-form" use:enhance>
					<div class="proposal-row">
						<label class="field-label" for="proposedTag">Missing a tag?</label>
						<div class="proposal-input-row">
							<input
								class="field-input"
								id="proposedTag"
								name="name"
								placeholder="Propose a new tag"
								bind:value={proposedTag}
								maxlength="60"
							/>
							<Button variant="secondary" type="submit">Propose</Button>
						</div>
						{#if data.proposalFlash || proposalMessage}
							<p class="proposal-note body" role="status">
								{data.proposalFlash ?? proposalMessage}
							</p>
						{/if}
					</div>
				</form>
				<div class="onboarding-actions">
					<Button variant="ghost" type="button" onclick={goBack}>Back</Button>
					<Button variant="primary" type="submit" form="saveServiceForm">Continue</Button>
				</div>
			{:else if activeStep === 'languages'}
				<h2 class="headline step-title">Languages you speak</h2>
				<StepTip>
					Seekers can filter and search by language, so this directly affects who finds you.
				</StepTip>
				<form method="POST" action="?/saveLanguages" class="step-form">
					<div class="chip-row">
						{#each data.languages as lang (lang.code)}
							<label class="chip chip-selectable">
								<input
									type="checkbox"
									class="chip-input"
									name="codes"
									value={lang.code}
									checked={data.profile.languageCodes.includes(lang.code)}
									aria-label={lang.name}
								/>
								{lang.name}
							</label>
						{/each}
					</div>
					<div class="onboarding-actions">
						<Button variant="ghost" type="button" onclick={goBack}>Back</Button>
						<Button variant="primary" type="submit">Continue</Button>
					</div>
				</form>
			{:else if activeStep === 'area'}
				<h2 class="headline step-title">Confirm your general area</h2>
				<StepTip>
					Only your general suburb or area is ever shown publicly. Your exact address is never
					displayed or stored for display — you share precise directions yourself, in messaging,
					once you have agreed to see someone.
				</StepTip>
				<form method="POST" action="?/saveArea" class="step-form">
					<label class="field-label" for="areaField">General area / suburb</label>
					<select
						class="field-input"
						id="areaField"
						name="areaId"
						bind:value={selectedAreaId}
						required
					>
						{#each data.areas as area (area.id)}
							<option value={area.id}>{area.name}</option>
						{/each}
					</select>
					<div class="onboarding-actions">
						<Button variant="ghost" type="button" onclick={goBack}>Back</Button>
						<Button variant="primary" type="submit">Continue</Button>
					</div>
				</form>
			{:else if activeStep === 'publish'}
				<h2 class="headline step-title">Review and publish</h2>
				<div class="review-row">
					<span class="label">Photos</span>
					<span class="body value">{data.profile.photos.length} added</span>
				</div>
				<div class="review-row">
					<span class="label">Introduction</span>
					<span class="body value">{introLength} / {INTRO_LIMIT} characters</span>
				</div>
				<div class="review-row">
					<span class="label">Services</span>
					<span class="body value">{data.profile.services.length} added</span>
				</div>
				<div class="review-row">
					<span class="label">Languages</span>
					<span class="body value">
						{data.languages
							.filter((l) => data.profile.languageCodes.includes(l.code))
							.map((l) => l.name)
							.join(', ') || 'None yet'}
					</span>
				</div>
				<div class="review-row">
					<span class="label">Area</span>
					<span class="body value">{data.profile.areaName ?? 'Not set'}</span>
				</div>
				{#if !data.profile.readiness.ready}
					<p class="readiness-blocked body" role="status">
						Publish is blocked until you complete: {data.missingSummary}.
					</p>
				{/if}
				<StepTip>
					{RESPONSE_TIME_DISCLOSURE_ONBOARDING}
				</StepTip>
				<StepTip>
					Your profile goes live immediately when you publish — there is no review step. You can
					unpublish it yourself at any time, with no data lost.
				</StepTip>
				<div class="onboarding-actions">
					<Button variant="ghost" type="button" onclick={goBack}>Back</Button>
					{#if data.profile.readiness.ready}
						<form method="POST" action="?/publish" class="publish-form">
							<Button variant="primary" type="submit">Publish</Button>
						</form>
					{:else}
						<Button variant="primary" disabled>Complete essentials first</Button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</main>

<style>
	.page {
		max-width: 56rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-lg);
	}
	.intro {
		margin: 0;
		color: var(--color-stone);
	}
	.progress-track {
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--color-divider);
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--color-peach-deep);
		border-radius: var(--radius-pill);
		transition: width 0.25s ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.progress-fill {
			transition: none;
		}
	}
	.onboarding-shell {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}
	@media (min-width: 768px) {
		.onboarding-shell {
			flex-direction: row;
			align-items: flex-start;
		}
	}
	.step-content {
		flex: 1;
		background: var(--color-paper);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		box-shadow: var(--shadow-rest);
		min-width: 0;
	}
	.step-title {
		margin: 0 0 var(--space-sm);
		font-size: 1.5rem;
	}
	.field-label {
		display: block;
		font-weight: 600;
		font-size: 0.9375rem;
		margin: var(--space-md) 0 6px;
	}
	.field-input,
	.field-textarea {
		width: 100%;
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: 12px 14px;
		font-family: var(--font-body-family);
		font-size: 1rem;
		color: var(--color-ink);
		background: var(--color-cream);
		min-height: 44px;
	}
	.field-input:focus,
	.field-textarea:focus {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-color: var(--color-peach-deep);
	}
	.field-textarea {
		resize: vertical;
		min-height: 110px;
	}
	.char-counter {
		text-align: right;
		margin-top: 4px;
		color: var(--color-stone);
	}
	.service-row {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	@media (max-width: 560px) {
		.service-row {
			grid-template-columns: 1fr;
		}
	}
	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}
	.chip-selectable {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		background: var(--color-paper);
		color: var(--color-ink);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-pill);
		padding: 8px 16px;
		cursor: pointer;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.chip-selectable:focus-within {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.chip-selectable:has(.chip-input:checked) {
		background: var(--color-ink);
		color: var(--color-paper);
		border-color: var(--color-ink);
	}
	.chip-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.onboarding-actions {
		display: flex;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-top: var(--space-xl);
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-divider);
	}
	.review-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--color-divider);
	}
	.value {
		color: var(--color-stone);
	}
	.readiness-blocked {
		margin: var(--space-md) 0 0;
		color: var(--color-peach-deep);
		font-weight: 600;
	}
	.form-error {
		color: var(--color-error);
		margin: 0 0 var(--space-sm);
	}
	.saved-services {
		margin: 0 0 var(--space-md);
		padding-left: var(--space-lg);
		color: var(--color-stone);
	}
	.step-form {
		display: block;
	}
	.publish-form {
		display: inline;
		margin: 0;
	}
	.proposal-row {
		margin-top: var(--space-md);
	}
	.proposal-form {
		display: block;
		margin: 0;
	}
	.proposal-input-row {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
	}
	.proposal-input-row .field-input {
		flex: 1;
	}
	.proposal-note {
		margin: var(--space-sm) 0 0;
		color: var(--color-pine);
	}
</style>
