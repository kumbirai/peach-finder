<script lang="ts">
	import AvailabilityPill from '$lib/components/AvailabilityPill.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
</script>

<svelte:head>
	<title>Find a massage therapist near you — Peach Finder</title>
</svelte:head>

<Navigation current="search" />

<main class="page">
	<p class="label kicker">Peach Finder</p>
	<h1 class="display">Find a massage therapist near you, right now.</h1>
	<p class="body">
		Warm, verified, available. Search therapists who are free to see you today — no calendars, no
		guesswork.
	</p>
	<div class="signals">
		<AvailabilityPill />
		<Badge kind="verified" />
	</div>
	<Button href="/" variant="primary">Search</Button>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md) 6rem;
		display: grid;
		gap: var(--space-lg);
	}
	.kicker {
		color: var(--color-stone);
		margin: 0;
	}
	.signals {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
</style>
