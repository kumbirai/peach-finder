<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		selected = false,
		intentKey,
		href,
		children,
		onclick
	}: {
		selected?: boolean;
		intentKey?: string;
		href?: string | undefined;
		children: Snippet;
		onclick?: (event: MouseEvent) => void;
	} = $props();
</script>

{#if href}
	<a class="chip chip-selected" {href} data-intent-key={intentKey}>
		{@render children()}
	</a>
{:else}
	<button
		class="chip"
		class:chip-selected={selected}
		type="button"
		data-intent-key={intentKey}
		{onclick}
		aria-pressed={selected}
	>
		{@render children()}
	</button>
{/if}

<style>
	.chip {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		background: var(--color-paper);
		color: var(--color-ink);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-pill);
		padding: 8px 16px;
		cursor: pointer;
		min-height: 44px;
		transition: background var(--motion-duration-fast) var(--motion-ease-out-expo);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.chip:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.chip-selected {
		background: var(--color-ink);
		color: var(--color-paper);
		border-color: var(--color-ink);
	}
</style>
