<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';

	let {
		data
	}: {
		data: {
			returnTo: string;
			action: string | null;
			providerProfileId: string | null;
		};
	} = $props();

	let email = $state('');
</script>

<svelte:head>
	<title>Sign in — Peach Finder</title>
</svelte:head>

<Navigation current="profile" variant="top" />

<main class="page">
	<h1 class="display">Sign in to continue</h1>
	{#if data.action}
		<p class="body">
			Create an account or sign in to {data.action} — you will return to where you left off.
		</p>
	{/if}

	<form class="form" method="post" action="/sign-in">
		<Input id="email" name="email" type="email" label="Email" bind:value={email} />
		<Input id="password" name="password" type="password" label="Password" />
		<input type="hidden" name="returnTo" value={data.returnTo} />
		{#if data.action}
			<input type="hidden" name="action" value={data.action} />
		{/if}
		{#if data.providerProfileId}
			<input type="hidden" name="providerProfileId" value={data.providerProfileId} />
		{/if}
		<Button type="submit" variant="primary">Continue</Button>
	</form>

	<p class="note label">
		Registration and OAuth sign-in are delivered in US-ACC-02. This screen satisfies the anonymous
		interruption path for account-gated actions.
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
	.form {
		display: grid;
		gap: var(--space-md);
	}
	.note {
		color: var(--color-stone);
	}
</style>
