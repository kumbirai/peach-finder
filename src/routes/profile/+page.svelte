<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import BlockedPeopleList from '$lib/components/BlockedPeopleList.svelte';
	import NotificationPreferences from '$lib/components/NotificationPreferences.svelte';
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
			providerProfile: {
				identityBadgeNotice: { suppressed: boolean; message: string | null };
			} | null;
			blockedPeople: Array<{ blockedId: string; displayName: string; blockedAt: string }>;
			notificationPreferences: {
				categories: Array<{
					id: string;
					label: string;
					description: string;
					essential: boolean;
					channels: Array<{
						id: string;
						label: string;
						enabled: boolean;
						mutable: boolean;
					}>;
				}>;
			} | null;
			deleteConfirm: boolean;
		};
		form?: {
			message?: string;
			passwordChanged?: boolean;
			displayNameUpdated?: boolean;
			displayName?: string;
			issues?: Array<{ path: string; message: string }>;
		};
	} = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let showDeleteConfirm = $derived(data.deleteConfirm);
	let deletePassword = $state('');
	let deleteError = $state<string | null>(null);
	let deleteBusy = $state(false);

	async function deleteAccount() {
		deleteError = null;
		deleteBusy = true;
		const passwordInput = document.getElementById('deletePassword') as HTMLInputElement | null;
		const password = passwordInput?.value ?? deletePassword;
		if (!password) {
			deleteError = 'Enter your password to confirm deletion.';
			deleteBusy = false;
			return;
		}
		try {
			const res = await fetch('/api/identity/account', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password, confirm: true })
			});
			if (res.ok) {
				window.location.href = '/?accountDeleted=1';
				return;
			}
			const body = (await res.json()) as {
				error?: { message?: string };
			};
			deleteError = body.error?.message ?? 'We could not delete your account. Try again.';
		} catch {
			deleteError = 'We could not delete your account. Check your connection and try again.';
		} finally {
			deleteBusy = false;
		}
	}
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
				{#if data.providerProfile?.identityBadgeNotice.suppressed && data.providerProfile.identityBadgeNotice.message}
					<p class="notice label" role="status">
						{data.providerProfile.identityBadgeNotice.message}
					</p>
				{/if}
				{#if form?.displayNameUpdated}
					<p class="success label" role="status">Display name updated.</p>
				{/if}
				<form class="form" method="POST" action="?/updateDisplayName" use:enhance>
					<Input
						id="displayName"
						name="displayName"
						label="Display name"
						value={form?.displayName ?? data.account?.displayName ?? ''}
					/>
					<Button type="submit" variant="primary">Save name</Button>
				</form>
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

		<section class="section" aria-labelledby="blocked-heading">
			<h2 id="blocked-heading" class="title">Blocked people</h2>
			<BlockedPeopleList blocks={data.blockedPeople} />
		</section>

		{#if data.notificationPreferences}
			<NotificationPreferences preferences={data.notificationPreferences} />
		{/if}

		<section class="section danger-zone" aria-labelledby="delete-heading">
			<h2 id="delete-heading" class="title">Delete account</h2>
			<Card>
				<p class="body hint">
					Deleting your account is permanent. Your profile is removed from discovery immediately.
					Message threads stay visible to the other person as <strong>Deleted account</strong>;
					reviews you wrote stay as <strong>Former user</strong>. Personal data is irreversibly
					removed within 30 days. Billing, tax, and moderation records we must keep by law are
					retained without your name or contact details.
				</p>
				{#if !data.account.hasPassword}
					<p class="body hint">
						Set a password via reset email before deleting an account that only uses sign-in with
						Google or Apple.
					</p>
				{:else if !showDeleteConfirm}
					<Button href="/profile?deleteConfirm=1" variant="secondary">Delete my account</Button>
				{:else}
					<p class="body confirm-prompt" role="status">
						Enter your password to confirm. This signs you out everywhere.
					</p>
					{#if deleteError}
						<p class="error label" role="alert">{deleteError}</p>
					{/if}
					<div class="form">
						<Input
							id="deletePassword"
							name="deletePassword"
							type="password"
							label="Password"
							bind:value={deletePassword}
							autocomplete="current-password"
						/>
						<div class="delete-actions">
							<Button type="button" variant="primary" disabled={deleteBusy} onclick={deleteAccount}>
								{deleteBusy ? 'Deleting…' : 'Yes, delete my account'}
							</Button>
							<Button href="/profile" variant="secondary" disabled={deleteBusy}>Cancel</Button>
						</div>
					</div>
				{/if}
			</Card>
		</section>
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
	.notice {
		margin: 0 0 var(--space-md);
		color: var(--color-peach-deep);
	}
	.error {
		color: var(--color-peach-deep);
		margin: 0 0 var(--space-sm);
	}
	.danger-zone .title {
		color: var(--color-peach-deep);
	}
	.confirm-prompt {
		margin: 0 0 var(--space-md);
		font-weight: 600;
	}
	.delete-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
</style>
