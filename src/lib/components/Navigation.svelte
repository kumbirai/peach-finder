<script lang="ts">
	import { page } from '$app/state';
	import RoleSwitch from './RoleSwitch.svelte';

	let {
		current = 'search',
		variant = 'auto'
	}: {
		current?: 'search' | 'messages' | 'profile' | 'provider';
		variant?: 'auto' | 'tabs' | 'top';
	} = $props();

	const signedIn = $derived(page.data.signedIn === true);
	const showRoleSwitch = $derived(page.data.capabilities?.isProvider === true);
	const activeRole = $derived(page.data.activeRole ?? 'anonymous');
</script>

<nav class="nav nav-{variant}" aria-label="Primary">
	<div class="top">
		<a class="logo title" href="/">peach·finder</a>
		<a class="top-link" class:active={current === 'search'} href="/">Search</a>
		<a class="top-link" class:active={current === 'messages'} href="/messages">Messages</a>
		{#if showRoleSwitch}
			<a class="top-link" class:active={current === 'provider'} href="/provider/dashboard"
				>Dashboard</a
			>
		{/if}
		<a class="top-link" class:active={current === 'profile'} href="/profile">Profile</a>
		{#if showRoleSwitch}
			<RoleSwitch {activeRole} />
		{/if}
		{#if signedIn}
			<form class="sign-out" method="POST" action="/api/identity/logout">
				<button type="submit" class="sign-out-btn label">Sign out</button>
			</form>
		{/if}
	</div>
	<div class="tabs">
		<a class="tab" class:active={current === 'search'} href="/">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
				<path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
			<span>Search</span>
		</a>
		<a class="tab" class:active={current === 'messages'} href="/messages">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
					stroke="currentColor"
					stroke-width="2"
					stroke-linejoin="round"
				/>
			</svg>
			<span>Messages</span>
		</a>
		{#if showRoleSwitch}
			<a class="tab" class:active={current === 'provider'} href="/provider/dashboard">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="2" />
					<path
						d="M8 15V9M12 15V7M16 15v-4"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				<span>Dashboard</span>
			</a>
		{/if}
		<a class="tab" class:active={current === 'profile'} href="/profile">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
				<path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke="currentColor" stroke-width="2" />
			</svg>
			<span>Profile</span>
		</a>
	</div>
	{#if showRoleSwitch}
		<div class="mobile-role-switch">
			<RoleSwitch {activeRole} />
		</div>
	{/if}
</nav>

<style>
	.logo {
		color: var(--color-ink);
		text-decoration: none;
	}
	.top {
		display: none;
		align-items: center;
		gap: var(--space-lg);
		padding: var(--space-md) var(--space-xl);
		background: var(--color-cream);
		flex-wrap: wrap;
	}
	.top-link {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		color: var(--color-stone);
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.top-link.active {
		color: var(--color-peach-deep);
	}
	.tabs {
		display: flex;
		background: var(--color-paper);
		box-shadow: var(--shadow-sheet);
		position: sticky;
		bottom: 0;
	}
	.tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px 0 8px;
		text-decoration: none;
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		color: var(--color-stone);
		min-height: 44px;
	}
	.tab.active {
		color: var(--color-peach-deep);
	}
	.nav-top .tabs {
		display: none;
	}
	.nav-top .top {
		display: flex;
	}
	.nav-top .mobile-role-switch {
		display: none;
	}
	.nav-tabs .top {
		display: none;
	}
	.nav-tabs .tabs {
		display: flex;
	}
	.mobile-role-switch {
		display: flex;
		justify-content: center;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-cream);
		border-top: 1px solid var(--color-divider);
	}
	@media (min-width: 768px) {
		.nav-auto .top {
			display: flex;
		}
		.nav-auto .tabs {
			display: none;
		}
		.nav-auto .mobile-role-switch {
			display: none;
		}
	}
	.sign-out {
		margin: 0;
		margin-left: auto;
	}
	.sign-out-btn {
		background: none;
		border: none;
		color: var(--color-peach-deep);
		cursor: pointer;
		min-height: 44px;
		padding: 0 var(--space-sm);
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
	}
	.sign-out-btn:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: 999px;
	}
</style>
