<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
</script>

<Navigation current="profile" />
<main class="page">
	<h1 class="headline">Profile</h1>
	<p class="body">Account and provider profile screens land in later waves.</p>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
	}
</style>
