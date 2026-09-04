<script lang="ts">
	let { title = 'peach·finder Admin' }: { title?: string } = $props();
</script>

<div class="strip" data-admin-ink-strip>
	<span class="mark">{title}</span>
</div>

<style>
	.strip {
		background: var(--color-ink);
		color: var(--color-paper);
		padding: var(--space-sm) var(--space-lg);
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
	}
	.mark {
		color: var(--color-paper);
	}
</style>
