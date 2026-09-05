<main class="admin-panel admin-panel--top">
	<h1 class="headline">Account lookup</h1>
	<p class="body">Search by name, email, or phone. Read-only — no impersonation (US-ADMIN-05).</p>
	<div class="admin-search">
		<label class="label" for="admin-account-search">Search accounts</label>
		<input id="admin-account-search" type="search" placeholder="Name, email, or phone" disabled />
	</div>
	<p class="body admin-empty">Lookup wiring lands with US-ADMIN-05.</p>
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

	.admin-search {
		margin-top: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		max-width: 28rem;
	}

	.admin-search input {
		border-radius: 14px;
		border: 1px solid var(--color-divider);
		padding: 12px 16px;
		min-height: 44px;
		font: inherit;
	}

	.admin-search input:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}

	.admin-empty {
		margin-top: var(--space-md);
	}
</style>
