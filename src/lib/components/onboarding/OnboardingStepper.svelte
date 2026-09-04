<script lang="ts">
	type OnboardingStep = 'photos' | 'intro' | 'services' | 'languages' | 'area' | 'publish';

	const STEP_META: Record<OnboardingStep, { index: number; label: string; shortLabel: string }> = {
		photos: { index: 1, label: 'Photos', shortLabel: 'Photos' },
		intro: { index: 2, label: 'Introduction', shortLabel: 'Introduction' },
		services: { index: 3, label: 'Services', shortLabel: 'Services' },
		languages: { index: 4, label: 'Languages', shortLabel: 'Languages' },
		area: { index: 5, label: 'Area', shortLabel: 'Area' },
		publish: { index: 6, label: 'Publish', shortLabel: 'Publish' }
	};

	let {
		steps,
		currentStep,
		onSelect
	}: {
		steps: Array<{ step: OnboardingStep; complete: boolean }>;
		currentStep: OnboardingStep;
		onSelect: (step: OnboardingStep) => void;
	} = $props();
</script>

<nav class="stepper" aria-label="Profile setup checklist">
	{#each steps as item (item.step)}
		{@const meta = STEP_META[item.step]}
		<button
			type="button"
			class="stepper-step"
			data-done={item.complete}
			aria-current={item.step === currentStep ? 'step' : undefined}
			onclick={() => onSelect(item.step)}
		>
			<span class="stepper-step__index" aria-hidden="true">{meta.index}</span>
			<span>{meta.shortLabel}</span>
		</button>
	{/each}
</nav>

<style>
	.stepper {
		display: flex;
		flex-direction: row;
		gap: var(--space-sm);
		overflow-x: auto;
		padding-bottom: var(--space-sm);
	}
	@media (min-width: 768px) {
		.stepper {
			flex-direction: column;
			width: 220px;
			flex-shrink: 0;
			position: sticky;
			top: 88px;
		}
	}
	.stepper-step {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		background: none;
		border: none;
		padding: 10px 12px;
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
		font-family: var(--font-body-family);
		font-size: 0.9375rem;
		color: var(--color-stone);
		white-space: nowrap;
		flex-shrink: 0;
		min-height: 44px;
	}
	.stepper-step:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.stepper-step[aria-current='step'] {
		background: var(--color-blush);
		color: var(--color-ink);
		font-weight: 600;
	}
	.stepper-step__index {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1.5px solid var(--color-stone);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		flex-shrink: 0;
		color: var(--color-stone);
	}
	.stepper-step[data-done='true'] .stepper-step__index {
		background: var(--color-pine);
		border-color: var(--color-pine);
		color: var(--color-paper);
	}
	.stepper-step[aria-current='step'] .stepper-step__index {
		border-color: var(--color-peach-deep);
		color: var(--color-peach-deep);
	}
</style>
