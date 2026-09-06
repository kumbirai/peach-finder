<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';

	let { data }: { data: { version: string } } = $props();
</script>

<svelte:head>
	<title>Terms of Service — Peach Finder</title>
	<meta name="description" content="The rules for using Peach Finder as a seeker or provider." />
</svelte:head>

<Navigation current="search" variant="top" />

<main class="page" data-testid="terms-of-service-page">
	<header class="intro">
		<h1 class="display">Terms of Service</h1>
		<p class="lede label">Version {data.version}</p>
		<p class="lede">
			These terms describe what you can expect from Peach Finder and what we expect from you. By
			creating an account you agree to this version.
		</p>
	</header>

	<section class="section" aria-labelledby="terms-service-heading">
		<h2 id="terms-service-heading" class="title">What Peach Finder is</h2>
		<p class="body copy">
			Peach Finder helps seekers discover independent massage therapists and contact them directly.
			We are a discovery and messaging platform — not a booking system, employer, or payment
			processor for the massage session itself.
		</p>
	</section>

	<section class="section" aria-labelledby="terms-conduct-heading">
		<h2 id="terms-conduct-heading" class="title">Your responsibilities</h2>
		<p class="body copy">
			You must provide accurate account information, keep your login secure, treat other people
			respectfully, and follow applicable law. Providers are responsible for the services they offer
			and for any arrangements made off-platform.
		</p>
	</section>

	<section class="section" aria-labelledby="terms-changes-heading">
		<h2 id="terms-changes-heading" class="title">Changes</h2>
		<p class="body copy">
			We may update these terms. When we do, we will publish a new version and may ask you to accept
			it before continuing to use certain features.
		</p>
	</section>
</main>

<style>
	.page {
		max-width: 42rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md) calc(6rem + env(safe-area-inset-bottom, 0px));
		display: grid;
		gap: var(--space-xl);
	}
	.intro {
		display: grid;
		gap: var(--space-sm);
	}
	.lede {
		margin: 0;
		color: var(--color-stone);
		max-width: 60ch;
	}
	.section {
		display: grid;
		gap: var(--space-md);
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-divider);
	}
	.section .title {
		font-family: var(--font-body-family);
		font-weight: 600;
		font-size: 1rem;
		margin: 0;
	}
	.copy {
		margin: 0;
		color: var(--color-stone);
		max-width: 70ch;
	}
</style>
