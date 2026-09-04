<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';

	let { data }: { data: { token: string | null; returnTo: string } } = $props();
</script>

<Navigation current="messages" variant="top" />

<main class="page">
	<h1 class="display">Verify your email</h1>
	<p class="body">Confirm your email address to send your first message.</p>
	{#if data.token}
		<form method="POST">
			<input type="hidden" name="token" value={data.token} />
			<input type="hidden" name="returnTo" value={data.returnTo} />
			<Button type="submit" variant="primary">Verify email</Button>
		</form>
	{:else}
		<p class="label">Check your inbox for the verification link.</p>
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
</style>
