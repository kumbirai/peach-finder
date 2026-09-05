<script lang="ts">
	import Chip from '$lib/components/Chip.svelte';
	import type { AppliedIntent } from '$lib/types/discovery';

	let {
		verified = false,
		available = false,
		appliedIntents = [],
		verifiedHref = '/',
		availableHref = '/',
		intentHrefs = {},
		onToggleVerified,
		onToggleAvailable
	}: {
		verified?: boolean;
		available?: boolean;
		appliedIntents?: AppliedIntent[];
		verifiedHref?: string;
		availableHref?: string;
		intentHrefs?: Record<string, string>;
		onToggleVerified?: () => void;
		onToggleAvailable?: () => void;
	} = $props();

	const derivedIntents = $derived(
		appliedIntents.filter((intent) => intent.key !== 'verified' && intent.key !== 'available')
	);
</script>

<div class="filters" role="group" aria-label="Search filters">
	<Chip
		selected={verified}
		href={verified ? verifiedHref : undefined}
		onclick={() => {
			if (!verified) onToggleVerified?.();
		}}>Verified</Chip
	>
	<Chip
		selected={available}
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
