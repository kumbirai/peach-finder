<script lang="ts">
	let {
		count,
		label = 'unread'
	}: {
		count: number;
		label?: string;
	} = $props();

	const visible = $derived(count > 0);
	const display = $derived(count > 99 ? '99+' : String(count));
</script>

{#if visible}
	<span class="unread-badge" data-testid="unread-badge" aria-label="{count} {label}">
		<span class="unread-dot" aria-hidden="true"></span>
		<span class="unread-count label">{display}</span>
	</span>
{/if}

<style>
	.unread-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	.unread-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-peach-deep);
	}
	.unread-count {
		color: var(--color-peach-deep);
		font-weight: 600;
		min-width: 1ch;
	}
</style>
