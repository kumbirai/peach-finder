<script lang="ts">
	let { lines = 3 }: { lines?: number } = $props();
</script>

<div class="skeleton" aria-hidden="true">
	{#each Array.from({ length: lines }) as _, i (i)}
		<div class="bar"></div>
	{/each}
</div>

<style>
	.skeleton {
		display: grid;
		gap: var(--space-sm);
	}
	.bar {
		height: 12px;
		border-radius: var(--radius-sm);
		background: linear-gradient(
			90deg,
			var(--color-blush) 0%,
			var(--color-paper) 50%,
			var(--color-blush) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.4s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
			background: var(--color-blush);
		}
	}
	@keyframes shimmer {
		0% {
			background-position: 100% 0;
		}
		100% {
			background-position: -100% 0;
		}
	}
</style>
