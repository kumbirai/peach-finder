<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';

	let { data }: { data: { version: string } } = $props();
</script>

<svelte:head>
	<title>Privacy Policy — Peach Finder</title>
	<meta
		name="description"
		content="How Peach Finder collects, uses, and protects your personal information."
	/>
</svelte:head>

<Navigation current="search" variant="top" />

<main class="page" data-testid="privacy-policy-page">
	<header class="intro">
		<h1 class="display">Privacy Policy</h1>
		<p class="lede label">Version {data.version}</p>
		<p class="lede">
			This plain-language summary explains how Peach Finder handles your information. It is not
			legal advice — your statutory rights under POPIA still apply.
		</p>
	</header>

	<section class="section" aria-labelledby="privacy-collect-heading">
		<h2 id="privacy-collect-heading" class="title">What we collect</h2>
		<p class="body copy">
			We collect what you give us to use the service: your account email, display name, and (for
			providers) a verified mobile number and profile details you choose to publish. We also store
			messages you send through Peach Finder and basic usage signals needed to run search and
			analytics fairly.
		</p>
	</section>

	<section class="section" aria-labelledby="privacy-use-heading">
		<h2 id="privacy-use-heading" class="title">How we use it</h2>
		<p class="body copy">
			We use your information to operate Peach Finder: authenticate you, show provider profiles,
			deliver messages and notifications, prevent abuse, and improve the platform in aggregate. We
			do not sell your personal information.
		</p>
	</section>

	<section class="section" aria-labelledby="privacy-rights-heading">
		<h2 id="privacy-rights-heading" class="title">Your choices</h2>
		<p class="body copy">
			You can update account details, control notification channels, and delete your account from
			your profile settings. Deletion triggers anonymization on a defined schedule; some records may
			be retained where the law requires.
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
