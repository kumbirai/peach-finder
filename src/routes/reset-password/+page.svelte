<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import { enhance } from '$app/forms';

	let {
		data,
		form
	}: {
		data: { token: string };
		form?: {
			message?: string;
			token?: string;
			issues?: Array<{ path: string; message: string }>;
		};
	} = $props();

	let newPassword = $state('');
	let confirmPassword = $state('');
	const token = $derived(form?.token ?? data.token);
</script>

<svelte:head>
	<title>Choose a new password — Peach Finder</title>
</svelte:head>

<Navigation current="profile" variant="top" />

<main class="page">
	<h1 class="display">Choose a new password</h1>
	<p class="body intro">Use at least 8 characters with letters and numbers.</p>

	{#if !token}
		<p class="error label" role="alert">This reset link is missing or invalid.</p>
		<Button href="/forgot-password" variant="primary">Request a new link</Button>
	{:else}
		{#if form?.message}
			<p class="error label" role="alert">{form.message}</p>
		{/if}

		<form class="form" method="POST" use:enhance>
			<input type="hidden" name="token" value={token} />
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
				label="Confirm password"
				bind:value={confirmPassword}
				autocomplete="new-password"
			/>
			<Button type="submit" variant="primary">Update password</Button>
		</form>
	{/if}
</main>

<style>
	.page {
		max-width: 28rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-lg);
	}
	.intro {
		color: var(--color-stone);
		margin: 0;
	}
	.form {
		display: grid;
		gap: var(--space-md);
	}
	.error {
		color: var(--color-peach-deep);
		margin: 0;
	}
</style>
