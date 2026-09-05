<script lang="ts">
	let { data }: { data: { config: Array<{ key: string; adminEditable: boolean }> } } = $props();
</script>

<main class="admin-panel admin-panel--top">
	<h1 class="headline">Platform config</h1>
	<p class="body">Runtime settings editable without deploy (US-ADMIN-06).</p>
	<ul class="config-list">
		{#each data.config as row (row.key)}
			<li>
				<span class="key">{row.key}</span>
				<span class="meta">{row.adminEditable ? 'Editable' : 'Read-only'}</span>
			</li>
		{/each}
	</ul>
</main>

<style>
	.admin-panel {
		padding: 0 var(--space-lg) var(--space-xl);
	}

	.admin-panel--top {
		padding-top: var(--space-lg);
	}

	.headline {
		font-family: var(--font-display-family);
		font-size: var(--font-headline-size);
	}

	.body {
		margin-top: var(--space-sm);
		color: var(--color-stone);
	}

	.config-list {
		margin-top: var(--space-lg);
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.config-list li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-paper);
		box-shadow: var(--shadow-rest);
		min-height: 44px;
		align-items: center;
	}

	.key {
		font-weight: 600;
	}

	.meta {
		color: var(--color-stone);
		font-size: 0.875rem;
	}
</style>
