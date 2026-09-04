<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import { enhance } from '$app/forms';

	let {
		form
	}: {
		form?: {
			message?: string;
			requested?: boolean;
			issues?: Array<{ path: string; message: string }>;
		};
	} = $props();

	let email = $state('');
</script>

<svelte:head>
	<title>Reset password — Peach Finder</title>
</svelte:head>

<Navigation current="profile" variant="top" />

<main class="page">
	<h1 class="display">Reset your password</h1>
	<p class="body intro">
		Enter the email on your account. If it exists, we will email a single-use link that expires in
		one hour.
	</p>

	{#if form?.requested}
		<p class="success label" role="status">
			If an account exists for that email, we have sent a reset link. Check your inbox.
		</p>
	{/if}

	{#if form?.message}
		<p class="error label" role="alert">{form.message}</p>
	{/if}

	<form class="form" method="POST" use:enhance>
		<Input id="email" name="email" type="email" label="Email" bind:value={email} />
		<Button type="submit" variant="primary">Send reset link</Button>
	</form>

	<p class="toggle label">
		<a class="link" href="/sign-in">Back to sign in</a>
	</p>
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
	.success {
		color: var(--color-pine);
		margin: 0;
	}
	.error {
		color: var(--color-peach-deep);
		margin: 0;
	}
	.toggle {
		text-align: center;
		color: var(--color-stone);
		margin: 0;
	}
	.link {
		color: var(--color-peach-deep);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
</style>
