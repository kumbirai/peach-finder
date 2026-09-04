<script lang="ts">
	import Chip from '$lib/components/Chip.svelte';
	import type { AppliedIntent } from '$lib/types/discovery';

	let {
		verified = false,
		available = false,
		appliedIntents = [],
		onToggleVerified,
		onToggleAvailable,
		onRemoveIntent
	}: {
		verified?: boolean;
		available?: boolean;
		appliedIntents?: AppliedIntent[];
		onToggleVerified?: () => void;
		onToggleAvailable?: () => void;
		onRemoveIntent?: (key: string) => void;
	} = $props();
</script>

<div class="filters" role="group" aria-label="Search filters">
	<Chip selected={verified} onclick={() => onToggleVerified?.()}>Verified</Chip>
	<Chip selected={available} onclick={() => onToggleAvailable?.()}>Available now</Chip>
	{#each appliedIntents as intent (intent.key)}
		<Chip selected onclick={() => onRemoveIntent?.(intent.key)}>{intent.label}</Chip>
	{/each}
</div>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
</style>
