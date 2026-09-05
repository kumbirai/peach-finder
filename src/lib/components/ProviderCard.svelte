<script lang="ts">
	import AvailabilityPill from '$lib/components/AvailabilityPill.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import type { SearchCard } from '$lib/types/discovery';

	let { card }: { card: SearchCard } = $props();

	const ratingLabel = $derived(
		'state' in card.rating ? 'New' : `${card.rating.average.toFixed(1)} (${card.rating.count})`
	);
</script>

<Card href="/provider/{card.providerProfileId}">
	<div class="photo-wrap">
		{#if card.photoUrl}
			<img class="card-photo" src={card.photoUrl} alt="" loading="lazy" />
		{:else}
			<div class="card-photo placeholder" aria-hidden="true">Photo placeholder</div>
		{/if}
		<div class="pill-row">
			{#if card.availability.state === 'available'}
				<AvailabilityPill setAt={card.availability.setAt} />
			{/if}
			{#if card.isFeatured}
				<span class="featured label">Featured</span>
			{/if}
		</div>
	</div>
	<div class="card-body">
		<div class="badges">
			{#if card.badges.identityVerified}
				<Badge kind="verified" />
			{/if}
			{#if card.badges.activeThisWeek}
				<Badge kind="verified" label="Active this week" />
			{/if}
		</div>
		<h2 class="title">{card.displayName}</h2>
		<p class="meta">
			<span class="stars" aria-label="Rating {ratingLabel}">&#9733; {ratingLabel}</span>
			<span>{card.areaName}</span>
			{#if card.priceFromCents}
				<span>From R{(card.priceFromCents / 100).toFixed(0)}</span>
			{/if}
		</p>
	</div>
</Card>

<style>
	.photo-wrap {
		position: relative;
	}
	.pill-row {
		position: absolute;
		top: var(--space-sm);
		left: var(--space-sm);
		right: var(--space-sm);
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: flex-start;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	.title {
		font-family: var(--font-title-family);
		font-size: var(--font-title-size);
		font-weight: var(--font-title-weight);
		margin: 0 0 var(--space-xs);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		color: var(--color-stone);
		margin: 0;
		font-size: 0.875rem;
	}
	.stars {
		color: var(--color-peach-deep);
	}
	.featured {
		display: inline-flex;
		align-items: center;
		background: var(--color-ink);
		color: var(--color-paper);
		border-radius: var(--radius-pill);
		padding: 4px 10px;
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-blush);
		color: var(--color-stone);
		font-size: 0.875rem;
	}
</style>
