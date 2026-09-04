<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		href,
		children
	}: {
		href?: string;
		children: Snippet;
	} = $props();
</script>

{#if href}
	<a class="card" {href}>
		{@render children()}
	</a>
{:else}
	<article class="card">
		{@render children()}
	</article>
{/if}

<style>
	.card {
		display: block;
		background: var(--color-paper);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--shadow-ambient-rest);
		text-decoration: none;
		color: inherit;
		transition:
			box-shadow var(--motion-duration-standard) var(--motion-ease-out-expo),
			transform var(--motion-duration-standard) var(--motion-ease-out-expo);
	}
	.card:hover {
		box-shadow: var(--shadow-lift-hover);
		transform: translateY(-2px);
	}
	.card:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.card :global(.card-photo) {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		display: block;
		background: var(--color-blush);
	}
	.card :global(.card-body) {
		padding: var(--space-lg);
	}
</style>
