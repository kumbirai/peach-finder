<script lang="ts">
	import AvailabilityPill from '$lib/components/AvailabilityPill.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	let name = $state('');
</script>

<svelte:head>
	<title>Component library — Peach Finder</title>
</svelte:head>

<main class="gallery">
	<h1 class="headline">Design-system primitives</h1>

	<section>
		<h2 class="title">Buttons</h2>
		<div class="row">
			<Button variant="primary">Send message</Button>
			<Button variant="secondary">View gallery</Button>
			<Button variant="ghost">Skip for now</Button>
		</div>
	</section>

	<section>
		<h2 class="title">Chips</h2>
		<div class="row">
			<Chip>Deep tissue</Chip>
			<Chip selected>Available now</Chip>
		</div>
	</section>

	<section>
		<h2 class="title">Availability &amp; badges</h2>
		<div class="row">
			<AvailabilityPill />
			<Badge kind="verified" />
			<Badge kind="available" />
		</div>
	</section>

	<section>
		<h2 class="title">Input</h2>
		<Input id="name" name="name" label="Display name" bind:value={name} placeholder="Amara T." />
		<Input
			id="email"
			name="email"
			label="Email"
			type="email"
			error="Enter a valid email address."
			value="not-an-email"
		/>
	</section>

	<section>
		<h2 class="title">Card</h2>
		<Card>
			<div class="card-photo"></div>
			<div class="card-body">
				<h3 class="title">Amara T.</h3>
				<p class="label">Deep tissue · Sandton</p>
			</div>
		</Card>
	</section>

	<section>
		<h2 class="title">Skeleton</h2>
		<Skeleton lines={3} />
	</section>

	<section>
		<h2 class="title">Navigation</h2>
		<Navigation current="search" variant="tabs" />
		<Navigation current="search" variant="top" />
	</section>
</main>

<style>
	.gallery {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md) 6rem;
		display: grid;
		gap: var(--space-xl);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		align-items: center;
	}
</style>
