<script lang="ts">
	import { availabilityPillLabel } from '$lib/availability-recency';

	let {
		setAt = null,
		now = new Date()
	}: {
		setAt?: string | null;
		now?: Date;
	} = $props();

	const label = $derived(availabilityPillLabel(setAt, now));
</script>

<span class="pill" data-component="availability-pill">
	<span class="dot" aria-hidden="true"></span>
	<span class="text">{label}</span>
</span>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--color-paper);
		color: var(--color-peach-deep-hover);
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		border-radius: var(--radius-pill);
		padding: 4px 10px 4px 8px;
		box-shadow: var(--shadow-ambient-rest);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-peach-deep);
		animation: pulse var(--motion-pulse-availability) var(--motion-ease-out-expo) infinite;
		flex-shrink: 0;
	}
	.text {
		color: inherit;
		font-weight: var(--font-label-weight);
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none;
		}
	}
	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 var(--color-peach-deep-pulse);
		}
		100% {
			box-shadow: 0 0 0 6px var(--color-peach-deep-pulse-end);
		}
	}
</style>
