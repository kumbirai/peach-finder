<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import { BADGE_EXPLANATIONS, BADGE_LABELS } from '$lib/trust-badges';

	let { data }: { data: { html: string } } = $props();
</script>

<svelte:head>
	<title>Safety information — Peach Finder</title>
	<meta
		name="description"
		content="What Peach Finder badges mean, meeting-safety basics, and how to report concerns."
	/>
</svelte:head>

<Navigation current="search" variant="top" />

<main class="page" data-testid="safety-page">
	<header class="intro">
		<h1 class="display">Safety information</h1>
		<p class="lede">
			Trust on Peach Finder is calibrated, not assumed. Here is what our badges do and do not mean,
			plus practical guidance for incall visits and reporting.
		</p>
	</header>

	<section class="section" aria-labelledby="badge-meanings-heading">
		<h2 id="badge-meanings-heading" class="title">What our badges mean</h2>
		<ul class="badge-list" data-testid="safety-badge-meanings">
			<li>
				<strong>{BADGE_LABELS.verified}</strong>
				<p>{BADGE_EXPLANATIONS.verified}</p>
			</li>
			<li>
				<strong>{BADGE_LABELS['active-week']}</strong>
				<p>{BADGE_EXPLANATIONS['active-week']}</p>
			</li>
		</ul>
		<p class="note label">
			These are the only two trust badges on Peach Finder — no other checkmark or trust icon is
			used.
		</p>
	</section>

	<section
		class="section safety-copy"
		aria-labelledby="safety-guidance-heading"
		data-testid="safety-guidance"
	>
		<h2 id="safety-guidance-heading" class="title">Meeting safely &amp; reporting</h2>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- sole sanctioned {@html} sink; HTML sanitized at config write time (security-implementation §8) -->
		<div class="rich-html">{@html data.html}</div>
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
	.badge-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--space-md);
	}
	.badge-list li {
		display: grid;
		gap: var(--space-xs);
	}
	.badge-list p {
		margin: 0;
		color: var(--color-stone);
	}
	.note {
		margin: 0;
		color: var(--color-stone);
	}
	.rich-html :global(p) {
		margin: 0 0 var(--space-sm);
		color: var(--color-stone);
		max-width: 70ch;
	}
	.rich-html :global(p:last-child) {
		margin-bottom: 0;
	}
</style>
