<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';

	type OnboardingStep = 'photos' | 'intro' | 'services' | 'languages' | 'area' | 'publish';

	type ProfileData = {
		onboarding: {
			steps: Array<{ step: OnboardingStep; complete: boolean }>;
			currentStep: OnboardingStep;
		};
	};

	const STEP_LABELS: Record<string, string> = {
		photos: 'Add at least one photo',
		intro: 'Write your introduction',
		services: 'Add your services and pricing',
		languages: 'Set your languages spoken',
		area: 'Confirm your general area',
		publish: 'Review and publish'
	};

	let {
		data
	}: {
		data: { profile: ProfileData };
	} = $props();

	const completedCount = $derived(
		data.profile.onboarding.steps.filter((s) => s.complete && s.step !== 'publish').length
	);
	const totalEssentials = 5;
</script>

<svelte:head>
	<title>Set up your profile — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page">
	<h1 class="display">Set up your profile</h1>
	<p class="body intro">
		{completedCount} of {totalEssentials} essentials complete. Pick up where you left off — your progress
		is saved.
	</p>

	<div class="progress-track" aria-hidden="true">
		<div class="progress-fill" style:width={`${(completedCount / totalEssentials) * 100}%`}></div>
	</div>

	<Card>
		<ul class="checklist" aria-label="Profile setup checklist">
			{#each data.profile.onboarding.steps as item (item.step)}
				<li class="checklist-item" data-complete={item.complete}>
					<span class="check-circle" aria-hidden="true">
						{#if item.complete}
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none">
								<path
									d="M20 6L9 17l-5-5"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{/if}
					</span>
					<span class="label">{STEP_LABELS[item.step] ?? item.step}</span>
					{#if item.step === data.profile.onboarding.currentStep && !item.complete}
						<span class="current label">Current step</span>
					{/if}
				</li>
			{/each}
		</ul>
	</Card>

	<p class="body hint">
		Full step-by-step editing arrives in the next release. Your draft profile is ready — complete
		each item above to publish when you are ready.
	</p>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-lg);
	}
	.intro,
	.hint {
		margin: 0;
		color: var(--color-stone);
	}
	.progress-track {
		height: 6px;
		border-radius: 999px;
		background: var(--color-divider);
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--color-peach-deep);
		border-radius: 999px;
		transition: width 0.25s ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.progress-fill {
			transition: none;
		}
	}
	.checklist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-sm);
	}
	.checklist-item {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 44px;
	}
	.check-circle {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		border: 2px solid var(--color-divider);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--color-verified);
	}
	.checklist-item[data-complete='true'] .check-circle {
		border-color: var(--color-verified);
		background: color-mix(in srgb, var(--color-verified) 12%, transparent);
	}
	.current {
		margin-left: auto;
		color: var(--color-peach-deep);
	}
</style>
