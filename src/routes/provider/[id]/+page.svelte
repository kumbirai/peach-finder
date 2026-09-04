<script lang="ts">
	import AvailabilityPill from '$lib/components/AvailabilityPill.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import ProfileContactBar from '$lib/components/ProfileContactBar.svelte';
	import type { PublicProfile } from '$lib/types/profile';

	let {
		data
	}: {
		data: {
			profile: PublicProfile;
			actions: { message: string; review: string; report: string; block: string };
		};
	} = $props();

	const ratingLabel = $derived(
		'state' in data.profile.rating
			? 'New'
			: `${data.profile.rating.average.toFixed(1)} (${data.profile.rating.count} reviews)`
	);
</script>

<svelte:head>
	<title>{data.profile.displayName} — Peach Finder</title>
	<meta name="description" content={data.profile.intro.slice(0, 150)} />
	{#if data.profile.photos[0]?.url}
		<meta property="og:image" content={data.profile.photos[0].url} />
	{/if}
</svelte:head>

<Navigation current="search" />

<main class="page">
	<section class="gallery" aria-label="Photos">
		{#if data.profile.photos[0]}
			<img class="hero" src={data.profile.photos[0].url} alt="" />
		{:else}
			<div class="hero placeholder">Photo placeholder</div>
		{/if}
	</section>

	<header class="profile-header">
		<div class="badges">
			{#if data.profile.availability.state === 'available'}
				<AvailabilityPill />
			{/if}
			{#if data.profile.badges.identityVerified}
				<Badge kind="verified" />
			{/if}
			{#if data.profile.badges.activeThisWeek}
				<Badge kind="verified" label="Active this week" />
			{/if}
		</div>
		<h1 class="display">{data.profile.displayName}</h1>
		<p class="stats">
			<span class="stars" aria-label="Rating {ratingLabel}">&#9733; {ratingLabel}</span>
			{#if data.profile.area}
				<span>{data.profile.area.name}</span>
			{/if}
			{#if data.profile.onlineStatus}
				<span>{data.profile.onlineStatus === 'online' ? 'Online now' : 'Active today'}</span>
			{/if}
		</p>
	</header>

	<section class="section">
		<h2 class="title">About</h2>
		<p>{data.profile.intro}</p>
	</section>

	{#if data.profile.services.length}
		<section class="section">
			<h2 class="title">Services</h2>
			<ul class="services">
				{#each data.profile.services as service (service.id)}
					<li>
						<strong>{service.name}</strong> — R{(service.priceCents / 100).toFixed(0)} ·
						{service.durationMinutes} min
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.profile.tags.length}
		<section class="section">
			<h2 class="title">Specialties</h2>
			<div class="tags">
				{#each data.profile.tags as tag (tag.id)}
					<span class="tag label">{tag.name}</span>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.profile.languages.length}
		<section class="section">
			<h2 class="title">Languages</h2>
			<p>{data.profile.languages.map((l) => l.name).join(', ')}</p>
		</section>
	{/if}

	{#if data.profile.reviews.length}
		<section class="section">
			<h2 class="title">Reviews</h2>
			<ul class="reviews">
				{#each data.profile.reviews as review (review.id)}
					<li>
						<p class="review-meta">
							<span class="stars">&#9733; {review.rating}</span>
							<span>{review.reviewerName}</span>
						</p>
						<p>{review.body}</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<ProfileContactBar
	messageHref={data.actions.message}
	reviewHref={data.actions.review}
	reportHref={data.actions.report}
	blockHref={data.actions.block}
/>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding-bottom: 5rem;
	}
	.gallery .hero {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		display: block;
		background: var(--color-blush);
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-stone);
	}
	.profile-header {
		padding: var(--space-lg);
		display: grid;
		gap: var(--space-sm);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		color: var(--color-stone);
		margin: 0;
	}
	.stars {
		color: var(--color-peach-deep);
	}
	.section {
		padding: 0 var(--space-lg) var(--space-lg);
	}
	.section .title {
		font-family: var(--font-title-family);
		margin: 0 0 var(--space-sm);
	}
	.services,
	.reviews {
		margin: 0;
		padding-left: 1.25rem;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.tag {
		background: var(--color-blush);
		padding: 6px 12px;
		border-radius: var(--radius-pill);
	}
	.review-meta {
		display: flex;
		gap: var(--space-sm);
		color: var(--color-stone);
		margin: 0 0 var(--space-xs);
	}
</style>
