<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import ProviderCard from '$lib/components/ProviderCard.svelte';
	import SearchFilters from '$lib/components/SearchFilters.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { AppliedIntent, SearchCard } from '$lib/types/discovery';

	let {
		data
	}: {
		data: {
			cards: SearchCard[];
			appliedIntents: AppliedIntent[];
			q: string;
			verified: boolean;
			available: boolean;
		};
	} = $props();

	let query = $derived(data.q);
	let searching = $state(false);

	function buildUrl(overrides: Record<string, string | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(overrides)) {
			if (!value) params.delete(key);
			else params.set(key, value);
		}
		return `/?${params.toString()}`;
	}

	async function submitSearch() {
		searching = true;
		await goto(buildUrl({ q: query || undefined }));
		searching = false;
	}

	function toggleFilter(key: 'verified' | 'available') {
		const current = key === 'verified' ? data.verified : data.available;
		goto(buildUrl({ [key]: current ? undefined : '1' }));
	}

	function removeIntent(key: string) {
		if (key === 'verified') goto(buildUrl({ verified: undefined }));
		else if (key === 'available') goto(buildUrl({ available: undefined }));
		else goto(buildUrl({ q: undefined }));
	}
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

	<form
		class="search-form"
		onsubmit={(e) => {
			e.preventDefault();
			submitSearch();
		}}
	>
		<Input
			id="search"
			name="q"
			label="Search therapists"
			placeholder="Deep tissue, speaks Zulu, available now…"
			bind:value={query}
		/>
		<Button type="submit" variant="primary">Search</Button>
	</form>

	<SearchFilters
		verified={data.verified}
		available={data.available}
		appliedIntents={data.appliedIntents}
		onToggleVerified={() => toggleFilter('verified')}
		onToggleAvailable={() => toggleFilter('available')}
		onRemoveIntent={removeIntent}
	/>

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
			{#each data.cards as card (card.providerProfileId)}
				<ProviderCard {card} />
			{/each}
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
	.search-form {
		display: grid;
		gap: var(--space-md);
	}
	.grid {
		display: grid;
		gap: var(--space-lg);
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
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
</style>
