<script lang="ts">
	let {
		kind = 'verified',
		label
	}: {
		kind?: 'verified' | 'available' | 'active-week';
		label?: string;
	} = $props();

	const text = $derived(
		label ??
			(kind === 'verified'
				? 'Identity verified'
				: kind === 'active-week'
					? 'Active this week'
					: 'Available now')
	);
</script>

<span class="badge badge-{kind}" data-component="badge" data-kind={kind}>
	{#if kind === 'verified' || kind === 'active-week'}
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			{#if kind === 'verified'}
				<path
					d="M9 12l2 2 4-4"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
			{:else}
				<path
					d="M3 12h4l2-7 4 14 2-7h6"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}
		</svg>
	{:else}
		<span class="dot" aria-hidden="true"></span>
	{/if}
	<span class="text">{text}</span>
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: var(--color-blush);
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		border-radius: var(--radius-pill);
		padding: 4px 10px;
	}
	.badge-verified {
		color: var(--color-pine);
	}
	.badge-active-week {
		background: var(--color-paper);
		color: var(--color-pine);
	}
	.badge-available {
		color: var(--color-peach-deep-hover);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
</style>
