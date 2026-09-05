<script lang="ts">
	let { title = 'peach·finder Admin' }: { title?: string } = $props();
</script>

<div class="strip" data-admin-ink-strip>
	<span class="mark">{title}</span>
	<span class="subdomain">TOTP session</span>
</div>

<style>
	.strip {
		background: var(--color-ink);
		color: var(--color-paper);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: 10px var(--space-lg);
		font-family: var(--font-label-family);
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.mark {
		color: var(--color-paper);
	}

	.subdomain {
		color: rgba(255, 252, 249, 0.65);
		font-weight: 400;
	}

	@media (max-width: 560px) {
		.strip {
			flex-direction: column;
			align-items: flex-start;
			gap: 2px;
		}
	}
</style>
