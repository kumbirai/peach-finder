<script lang="ts">
	import Button from '$lib/components/Button.svelte';
</script>

<main class="admin-panel admin-panel--top">
	<h1 class="headline">Admin console</h1>
	<p class="body">
		Identity review, report resolution, account lookup, moderation actions, and platform
		configuration live here. Every write is audit-logged in the owning module.
	</p>
	<ul class="links">
		<li><a href="/admin/identity">Identity queue</a></li>
		<li><a href="/admin/reports">Reports queue</a></li>
		<li><a href="/admin/accounts">Account lookup</a></li>
		<li><a href="/admin/moderation">Moderation actions</a></li>
		<li><a href="/admin/config">Platform config</a></li>
		<li><a href="/admin/audit">Audit log</a></li>
	</ul>
	<form method="POST" action="/api/identity/logout?returnTo=/admin/login">
		<Button type="submit" variant="secondary">Sign out</Button>
	</form>
</main>

<style>
	.admin-panel {
		padding: var(--space-lg);
		max-width: 48rem;
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

	.links {
		margin: var(--space-lg) 0;
		padding-left: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.links a {
		color: var(--color-peach-deep);
		font-weight: 600;
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}

	.links a:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}
</style>
