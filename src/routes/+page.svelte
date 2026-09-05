<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import NearMeControl, { type ProximityState } from '$lib/components/NearMeControl.svelte';
	import ProviderCard from '$lib/components/ProviderCard.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchFilters from '$lib/components/SearchFilters.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { DISCOVERY_MANUAL_FILTER_CHIPS, toggleManualFilter } from '$lib/manual-filters';
	import {
		removeIntentFromState,
		structuredQueryToParams,
		type SearchUrlState
	} from '$lib/search-url';
	import type { AppliedIntent, SearchCard } from '$lib/types/discovery';

	const DISCOVERY_REFRESH_MS = 60_000;

	let {
		data
	}: {
		data: {
			cards: SearchCard[];
			appliedIntents: AppliedIntent[];
			q: string;
			verified: boolean;
			available: boolean;
			langs: string[];
			tags: string[];
			minRating: number | null;
			priceMin: number | null;
			priceMax: number | null;
			near: boolean;
			lat: number | null;
			lng: number | null;
			areaSlug: string | null;
			proximityLabel: string | null;
		};
	} = $props();

	let searching = $state(false);

	const availableCards = $derived(
		data.cards.filter((card) => card.availability.state === 'available')
	);
	const restCards = $derived(data.cards.filter((card) => card.availability.state !== 'available'));
	const visibleAppliedIntents = $derived(
		data.proximityLabel
			? data.appliedIntents
			: data.appliedIntents.filter((intent) => intent.key !== 'near')
	);
	const orphanProximity = $derived(
		!data.proximityLabel &&
			(data.near || data.lat != null || data.lng != null || data.areaSlug != null)
	);
	const clearProximityHref = $derived(
		hrefForState({
			...currentUrlState(),
			near: false,
			lat: null,
			lng: null,
			areaSlug: null
		})
	);
	const isDefaultHomepage = $derived(
		!data.q &&
			!data.verified &&
			!data.available &&
			data.langs.length === 0 &&
			data.tags.length === 0 &&
			data.minRating == null &&
			data.priceMin == null &&
			data.priceMax == null &&
			!data.near &&
			data.lat == null &&
			data.lng == null &&
			!data.areaSlug &&
			data.appliedIntents.length === 0
	);

	function currentUrlState(): SearchUrlState {
		return {
			q: data.q,
			verified: data.verified,
			available: data.available,
			langs: data.langs,
			tags: data.tags,
			minRating: data.minRating,
			priceMin: data.priceMin,
			priceMax: data.priceMax,
			near: data.near,
			lat: data.lat,
			lng: data.lng,
			areaSlug: data.areaSlug
		};
	}

	async function applyProximity(state: ProximityState) {
		const next = currentUrlState();
		next.near = state.near;
		next.lat = state.lat;
		next.lng = state.lng;
		next.areaSlug = state.areaSlug;
		await goto(hrefForState(next), { invalidateAll: true, replaceState: true });
	}

	async function submitSearch(q: string) {
		searching = true;
		const params = structuredQueryToParams(currentUrlState());
		const trimmed = q.trim();
		if (trimmed) params.set('q', trimmed);
		else params.delete('q');
		await goto(params.toString() ? `/?${params.toString()}` : '/');
		searching = false;
	}

	function hrefForState(state: SearchUrlState): string {
		const params = structuredQueryToParams(state);
		return params.toString() ? `/?${params.toString()}` : '/';
	}

	function toggleAvailableFilter() {
		const state = currentUrlState();
		state.available = !state.available;
		void goto(hrefForState(state));
	}

	function toggleManualFilterChip(index: number) {
		const chip = DISCOVERY_MANUAL_FILTER_CHIPS[index];
		if (!chip) return;
		void goto(hrefForState(toggleManualFilter(chip, currentUrlState())));
	}

	const availableHref = $derived(
		hrefForState(removeIntentFromState(currentUrlState(), 'available'))
	);
	const intentHrefs = $derived(
		Object.fromEntries(
			visibleAppliedIntents.map((intent) => [
				intent.key,
				hrefForState(removeIntentFromState(currentUrlState(), intent.key))
			])
		)
	);

	onMount(() => {
		const timer = window.setInterval(() => {
			const params = new URLSearchParams(window.location.search);
			const hasFilters =
				params.get('q') ||
				params.get('verified') === '1' ||
				params.get('available') === '1' ||
				params.has('lang') ||
				params.has('tag') ||
				params.has('minRating') ||
				params.has('priceMin') ||
				params.has('priceMax') ||
				params.get('near') === '1' ||
				params.has('lat') ||
				params.has('lng') ||
				params.has('area');
			if (!hasFilters) void invalidateAll();
		}, DISCOVERY_REFRESH_MS);
		return () => window.clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Find a massage therapist near you — Peach Finder</title>
	<meta
		name="description"
		content="Browse available massage therapists near you. No sign-in required to search and view profiles."
	/>
</svelte:head>

<Navigation current="search" />

<main class="page">
	<section class="discover-intro">
		<p class="label kicker">Trusted therapists near you</p>
		<h1 class="display">Find relief, right now.</h1>
		<p class="body">
			See who is available, compare what matters, and start a conversation when you are ready.
		</p>
	</section>

	<div class="search-sticky">
		{#key data.q}
			<SearchBar value={data.q} onSearch={submitSearch} />
		{/key}

		<NearMeControl
			proximityLabel={data.proximityLabel}
			{orphanProximity}
			{clearProximityHref}
			onProximityChange={applyProximity}
		/>

		<SearchFilters
			verified={data.verified}
			available={data.available}
			langs={data.langs}
			minRating={data.minRating}
			priceMax={data.priceMax}
			appliedIntents={visibleAppliedIntents}
			{availableHref}
			{intentHrefs}
			onToggleAvailable={toggleAvailableFilter}
			onToggleManualFilter={toggleManualFilterChip}
		/>
	</div>

	{#if searching}
		<div class="grid">
			{#each Array(3) as _, i (i)}
				<Skeleton lines={4} />
			{/each}
		</div>
	{:else if data.cards.length === 0}
		<div class="empty">
			<p class="title">No therapists match those filters.</p>
			<p class="body">Try removing a filter or broadening your search.</p>
			<Button href="/" variant="secondary">Clear filters</Button>
		</div>
	{:else}
		<p class="results-summary label">
			{data.cards.length} therapist{data.cards.length === 1 ? '' : 's'} found
		</p>
		<div class="grid">
			{#if isDefaultHomepage && availableCards.length > 0}
				<h2 class="section-label">
					{availableCards.length} available now
				</h2>
				{#each availableCards as card (card.providerProfileId)}
					<ProviderCard {card} />
				{/each}
				{#if restCards.length > 0}
					<h2 class="section-label section-label--rest">More therapists nearby</h2>
					{#each restCards as card (card.providerProfileId)}
						<ProviderCard {card} />
					{/each}
				{/if}
			{:else}
				{#each data.cards as card (card.providerProfileId)}
					<ProviderCard {card} />
				{/each}
			{/if}
		</div>
	{/if}
</main>

<style>
	.page {
		max-width: 56rem;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-md) 6rem;
		display: grid;
		gap: var(--space-lg);
	}
	.kicker {
		color: var(--color-stone);
		margin: 0;
	}
	.search-sticky {
		position: sticky;
		top: 4.5rem;
		z-index: 10;
		display: grid;
		gap: var(--space-md);
		padding: var(--space-sm) 0 var(--space-md);
		background: var(--color-cream);
		box-shadow: 0 0 0 var(--space-sm) var(--color-cream);
	}
	.grid {
		display: grid;
		gap: var(--space-lg);
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
	}
	.section-label {
		grid-column: 1 / -1;
		font-family: var(--font-body-family);
		font-weight: 600;
		font-size: 1.125rem;
		color: var(--color-ink);
		margin: 0;
	}
	.section-label--rest {
		margin-top: var(--space-sm);
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-divider);
		color: var(--color-stone);
	}
	.results-summary {
		color: var(--color-stone);
		margin: 0;
	}
	.empty {
		display: grid;
		gap: var(--space-md);
		padding: var(--space-xl);
		background: var(--color-paper);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-ambient-rest);
	}
	@media (prefers-reduced-motion: reduce) {
		.search-sticky {
			box-shadow: none;
		}
	}
</style>
