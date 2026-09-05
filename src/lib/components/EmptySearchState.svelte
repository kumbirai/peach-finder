<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { AppliedIntent } from '$lib/types/discovery';

	let {
		appliedIntents = [],
		relaxationActionLabel = null,
		relaxationHref = null
	}: {
		appliedIntents?: AppliedIntent[];
		relaxationActionLabel?: string | null;
		relaxationHref?: string | null;
	} = $props();

	const filterSummary = $derived(appliedIntents.map((intent) => intent.label).join(', '));
</script>

<div class="empty-state" data-testid="empty-search-state">
	<div class="icon-wrap" aria-hidden="true">
		<svg width="28" height="28" viewBox="0 0 24 24" fill="none">
			<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
			<path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
	</div>

	<h2 class="headline">No one matches those filters yet</h2>

	{#if appliedIntents.length > 0}
		<p class="body">
			Nothing matched with
			<span class="filters" data-testid="constraining-filters">{filterSummary}</span>. Try removing
			one filter — we&rsquo;ll keep availability first when results return.
		</p>
	{:else}
		<p class="body">
			Try a nearby area or broaden your search. We&rsquo;ll keep availability first when results
			return.
		</p>
	{/if}

	{#if relaxationHref && relaxationActionLabel}
		<div data-testid="relaxation-action">
			<Button href={relaxationHref} variant="secondary">{relaxationActionLabel}</Button>
		</div>
	{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-md);
		padding: var(--space-2xl) var(--space-lg);
		background: var(--color-paper);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-ambient-rest);
	}
	.icon-wrap {
		width: 4rem;
		height: 4rem;
		border-radius: 50%;
		background: var(--color-blush);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-peach-deep);
	}
	.headline {
		font-family: var(--font-display-family);
		font-weight: 500;
		font-size: 1.375rem;
		color: var(--color-ink);
		margin: 0;
	}
	.body {
		color: var(--color-stone);
		max-width: 42ch;
		margin: 0;
		line-height: 1.5;
	}
	.filters {
		color: var(--color-ink);
		font-weight: 600;
	}
</style>
