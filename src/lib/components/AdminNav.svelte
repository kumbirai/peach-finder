<script lang="ts">
	import { page } from '$app/stores';

	type AdminTab = {
		href: string;
		label: string;
		match: (path: string) => boolean;
	};

	const tabs: AdminTab[] = [
		{
			href: '/admin/identity',
			label: 'Identity queue',
			match: (p) => p.startsWith('/admin/identity')
		},
		{
			href: '/admin/reports',
			label: 'Reports queue',
			match: (p) => p.startsWith('/admin/reports')
		},
		{ href: '/admin/accounts', label: 'Accounts', match: (p) => p.startsWith('/admin/accounts') },
		{
			href: '/admin/moderation',
			label: 'Moderation',
			match: (p) => p.startsWith('/admin/moderation')
		},
		{ href: '/admin/config', label: 'Platform config', match: (p) => p.startsWith('/admin/config') }
	];
</script>

<nav class="admin-tabs" aria-label="Admin console sections">
	{#each tabs as tab (tab.href)}
		<a
			class="admin-tab"
			href={tab.href}
			aria-current={tab.match($page.url.pathname) ? 'page' : undefined}
		>
			{tab.label}
		</a>
	{/each}
</nav>

<style>
	.admin-tabs {
		display: flex;
		gap: var(--space-xs);
		padding: var(--space-md) var(--space-lg) 0;
		overflow-x: auto;
		border-bottom: 1px solid var(--color-divider);
	}

	.admin-tab {
		background: none;
		border: none;
		padding: 10px 16px;
		font-family: var(--font-body-family);
		font-weight: 600;
		font-size: 0.9375rem;
		color: var(--color-stone);
		cursor: pointer;
		white-space: nowrap;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		min-height: 44px;
		text-decoration: none;
		border-radius: var(--radius-pill) var(--radius-pill) 0 0;
	}

	.admin-tab[aria-current='page'] {
		color: var(--color-ink);
		border-bottom-color: var(--color-peach-deep);
	}

	.admin-tab:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
</style>
