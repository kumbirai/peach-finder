<script lang="ts">
	import Card from '$lib/components/Card.svelte';

	let {
		billing
	}: {
		billing: {
			headline: string;
			stateChipLabel: string;
			trialEndsAt: string | null;
			graceEndsAt: string | null;
			endDateLabel: string | null;
			endDatePrefix: string | null;
			whatHappensNext: string;
		};
	} = $props();

	const endDateTime = $derived(billing.trialEndsAt ?? billing.graceEndsAt ?? null);
</script>

<section
	class="billing-status"
	aria-labelledby="listing-billing-heading"
	data-testid="listing-billing-status"
>
	<Card>
		<div class="billing-status__header">
			<h2 id="listing-billing-heading" class="title">{billing.headline}</h2>
			<span class="status-chip" data-testid="listing-billing-state-chip"
				>{billing.stateChipLabel}</span
			>
		</div>

		{#if billing.endDateLabel && billing.endDatePrefix}
			<p class="end-date label" data-testid="listing-billing-end-date">
				<span class="end-date__label">{billing.endDatePrefix}</span>
				{#if endDateTime}
					<time datetime={endDateTime}>{billing.endDateLabel}</time>
				{:else}
					{billing.endDateLabel}
				{/if}
			</p>
		{/if}

		<p class="body consequence" data-testid="listing-billing-what-happens-next">
			{billing.whatHappensNext}
		</p>
	</Card>
</section>

<style>
	.billing-status {
		display: grid;
		gap: var(--space-md);
	}

	.billing-status__header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}

	.title {
		margin: 0;
		font-size: var(--text-title);
		color: var(--color-ink);
	}

	.status-chip {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		padding: 0 var(--space-md);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--color-peach-deep) 12%, var(--color-paper));
		color: var(--color-peach-deep);
		font-size: var(--text-label);
		font-weight: 700;
		border: 1px solid color-mix(in srgb, var(--color-peach-deep) 25%, transparent);
	}

	.end-date {
		margin: 0 0 var(--space-sm);
		display: grid;
		gap: var(--space-xs);
		color: var(--color-peach-deep);
		font-weight: 700;
	}

	.end-date__label {
		color: var(--color-stone);
		font-weight: 600;
	}

	.consequence {
		margin: 0;
		color: var(--color-stone);
		max-width: 60ch;
	}
</style>
