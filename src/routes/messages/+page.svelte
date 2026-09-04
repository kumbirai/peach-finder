<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
</script>

<Navigation current="messages" />
<main class="page">
	<h1 class="headline">Messages</h1>
	<p class="body">Sign in to message a therapist. Messaging lands in a later wave.</p>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
	}
</style>
