<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import { enhance } from '$app/forms';

	let {
		data,
		form
	}: {
		data: {
			account: {
				displayName: string;
				email: string | null;
				emailVerified: boolean;
				hasPassword: boolean;
			} | null;
		};
		form?: {
			message?: string;
			passwordChanged?: boolean;
			issues?: Array<{ path: string; message: string }>;
		};
	} = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
</script>

<svelte:head>
	<title>Profile — Peach Finder</title>
</svelte:head>

<Navigation current="profile" />

<main class="page">
	<h1 class="headline">Profile</h1>

	{#if !data.account}
		<Card>
			<p class="body">
				Sign in to manage your account, stay signed in on this device, or sign out.
			</p>
			<Button href="/sign-in?returnTo=/profile" variant="primary">Sign in</Button>
		</Card>
	{:else}
		<section class="section" aria-labelledby="account-heading">
			<h2 id="account-heading" class="title">Account</h2>
			<Card>
				<p class="body name">{data.account.displayName}</p>
				{#if data.account.email}
					<p class="label email">
						{data.account.email}
						{#if data.account.emailVerified}
							<span class="verified">Verified</span>
						{:else}
							<span class="pending">Not verified</span>
						{/if}
					</p>
				{/if}
				<form class="sign-out" method="POST" action="?/logout" use:enhance>
					<Button type="submit" variant="secondary">Sign out</Button>
				</form>
			</Card>
		</section>

		{#if data.account.hasPassword}
			<section class="section" aria-labelledby="password-heading">
				<h2 id="password-heading" class="title">Password</h2>
				<Card>
					<p class="body hint">
						Changing your password signs out other devices but keeps this one signed in.
					</p>
					{#if form?.passwordChanged}
						<p class="success label" role="status">Password updated.</p>
					{/if}
					{#if form?.message}
						<p class="error label" role="alert">{form.message}</p>
					{/if}
					<form class="form" method="POST" action="?/changePassword" use:enhance>
						<Input
							id="currentPassword"
							name="currentPassword"
							type="password"
							label="Current password"
							bind:value={currentPassword}
							autocomplete="current-password"
						/>
						<Input
							id="newPassword"
							name="newPassword"
							type="password"
							label="New password"
							bind:value={newPassword}
							autocomplete="new-password"
						/>
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							label="Confirm new password"
							bind:value={confirmPassword}
							autocomplete="new-password"
						/>
						<Button type="submit" variant="primary">Update password</Button>
					</form>
				</Card>
			</section>
		{/if}
	{/if}
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-xl);
	}
	.section {
		display: grid;
		gap: var(--space-md);
	}
	.name {
		margin: 0 0 var(--space-sm);
		font-weight: 600;
	}
	.email {
		margin: 0 0 var(--space-md);
		color: var(--color-stone);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		align-items: center;
	}
	.verified {
		color: var(--color-pine);
	}
	.pending {
		color: var(--color-stone);
	}
	.sign-out {
		margin: 0;
	}
	.hint {
		margin: 0 0 var(--space-md);
		color: var(--color-stone);
	}
	.form {
		display: grid;
		gap: var(--space-md);
	}
	.success {
		color: var(--color-pine);
		margin: 0 0 var(--space-sm);
	}
	.error {
		color: var(--color-peach-deep);
		margin: 0 0 var(--space-sm);
	}
</style>
