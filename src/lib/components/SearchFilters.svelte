<script lang="ts">
	import Chip from '$lib/components/Chip.svelte';
	import {
		DISCOVERY_MANUAL_FILTER_CHIPS,
		isManualFilterActive,
		manualFilterIntentKey
	} from '$lib/manual-filters';
	import type { AppliedIntent } from '$lib/types/discovery';

	let {
		verified = false,
		available = false,
		langs = [],
		minRating = null,
		priceMax = null,
		appliedIntents = [],
		availableHref = '/',
		intentHrefs = {},
		onToggleAvailable,
		onToggleManualFilter
	}: {
		verified?: boolean;
		available?: boolean;
		langs?: string[];
		minRating?: number | null;
		priceMax?: number | null;
		appliedIntents?: AppliedIntent[];
		availableHref?: string;
		intentHrefs?: Record<string, string>;
		onToggleAvailable?: () => void;
		onToggleManualFilter?: (index: number) => void;
	} = $props();

	const derivedIntents = $derived(
		appliedIntents.filter((intent) => {
			if (intent.key === 'verified' || intent.key === 'available') return false;
			return !DISCOVERY_MANUAL_FILTER_CHIPS.some(
				(chip) => manualFilterIntentKey(chip) === intent.key
			);
		})
	);
</script>

<div class="filters" role="group" aria-label="Search filters">
	{#each DISCOVERY_MANUAL_FILTER_CHIPS as chip, index (chip.kind + (chip.kind === 'lang' ? chip.code : chip.kind === 'priceMax' ? chip.cents : chip.kind === 'minRating' ? chip.value : ''))}
		{@const active = isManualFilterActive(chip, {
			q: '',
			verified,
			available,
			langs,
			tags: [],
			minRating,
			priceMin: null,
			priceMax,
			near: false
		})}
		{@const intentKey = manualFilterIntentKey(chip)}
		<Chip
			selected={active}
			{intentKey}
			href={active ? (intentHrefs[intentKey] ?? '/') : undefined}
			onclick={() => {
				if (!active) onToggleManualFilter?.(index);
			}}
		>
			{chip.label}
		</Chip>
	{/each}
	<Chip
		selected={available}
		intentKey="available"
		href={available ? availableHref : undefined}
		onclick={() => {
			if (!available) onToggleAvailable?.();
		}}>Available now</Chip
	>
	{#each derivedIntents as intent (intent.key)}
		<Chip selected intentKey={intent.key} href={intentHrefs[intent.key] ?? '/'}>
			{intent.label}
		</Chip>
	{/each}
</div>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
</style>
