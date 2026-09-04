<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="step-tip" role="note">
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
		<path d="M12 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		<circle cx="12" cy="16" r="0.75" fill="currentColor" />
	</svg>
	<span>{@render children()}</span>
</div>

<style>
	.step-tip {
		display: flex;
		gap: var(--space-sm);
		background: var(--color-blush);
		color: var(--color-pine);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		font-size: 0.875rem;
		margin: var(--space-md) 0 var(--space-lg);
	}
	.step-tip svg {
		flex-shrink: 0;
		margin-top: 2px;
	}
</style>
