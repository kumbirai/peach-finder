<script lang="ts">
	import AvailabilityPill from '$lib/components/AvailabilityPill.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ProfileContactBar from '$lib/components/ProfileContactBar.svelte';
	import type { PublicProfile } from '$lib/types/profile';

	let {
		profile,
		previewMode = false,
		primaryHeading = false,
		actions,
		messageDraftKey
	}: {
		profile: PublicProfile;
		previewMode?: boolean;
		primaryHeading?: boolean;
		actions?: { message: string; review: string; report: string; block: string };
		messageDraftKey?: string;
	} = $props();

	const callHref = $derived(
		previewMode
			? profile.phone
				? '#'
				: undefined
			: profile.phone
				? `tel:${profile.phone}`
				: undefined
	);
	const messageHref = $derived(
		previewMode ? '#' : (actions?.message ?? `/messages/compose/${profile.id}`)
	);
	const reviewHref = $derived(
		previewMode ? '#' : (actions?.review ?? `/provider/${profile.id}/review`)
	);
	const reportHref = $derived(
		previewMode ? '#' : (actions?.report ?? `/provider/${profile.id}/report`)
	);
	const blockHref = $derived(
		previewMode ? '#' : (actions?.block ?? `/provider/${profile.id}/block`)
	);

	const ratingLabel = $derived(
		'state' in profile.rating
			? 'New'
			: `${profile.rating.average.toFixed(1)} (${profile.rating.count} reviews)`
	);
</script>

<article class="profile-view" data-preview={previewMode ? 'true' : undefined}>
	<section class="gallery" aria-label="Photos">
		{#if profile.photos[0]}
			<img class="hero" src={profile.photos[0].url} alt="" />
		{:else}
			<div class="hero placeholder">Photo placeholder</div>
		{/if}
	</section>

	<header class="profile-header">
		<div class="badges">
			{#if profile.availability.state === 'available'}
				<AvailabilityPill setAt={profile.availability.setAt} />
			{/if}
			{#if profile.badges.identityVerified}
				<Badge kind="verified" />
			{/if}
			{#if profile.badges.activeThisWeek}
				<Badge kind="verified" label="Active this week" />
			{/if}
		</div>
		{#if primaryHeading}
			<h1 class="display page-title">{profile.displayName}</h1>
		{:else}
			<h2 class="display">{profile.displayName}</h2>
		{/if}
		<p class="stats">
			<span class="stars" aria-label="Rating {ratingLabel}">&#9733; {ratingLabel}</span>
			{#if profile.area}
				<span>{profile.area.name}</span>
			{/if}
			{#if profile.onlineStatus}
				<span>{profile.onlineStatus === 'online' ? 'Online now' : 'Active today'}</span>
			{/if}
		</p>
	</header>

	<section class="section">
		<h3 class="title">About</h3>
		<p>{profile.intro}</p>
	</section>

	{#if profile.services.length}
		<section class="section">
			<h3 class="title">Services</h3>
			<ul class="services">
				{#each profile.services as service (service.id)}
					<li>
						<strong>{service.name}</strong> — R{(service.priceCents / 100).toFixed(0)} ·
						{service.durationMinutes} min
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if profile.tags.length}
		<section class="section">
			<h3 class="title">Specialties</h3>
			<div class="tags">
				{#each profile.tags as tag (tag.id)}
					<span class="tag label">{tag.name}</span>
				{/each}
			</div>
		</section>
	{/if}

	{#if profile.languages.length}
		<section class="section">
			<h3 class="title">Languages</h3>
			<p>{profile.languages.map((l) => l.name).join(', ')}</p>
		</section>
	{/if}

	{#if profile.phone}
		<section class="section" aria-labelledby="contact-heading-{profile.id}">
			<h3 id="contact-heading-{profile.id}" class="title">Contact</h3>
			<p class="contact-copy">
				{profile.displayName.split(' ')[0]} has chosen to share a phone number with people browsing Peach
				Finder.
			</p>
			<p class="phone-line">
				Phone:
				{#if previewMode}
					<strong class="phone-number">{profile.phone}</strong>
				{:else}
					<a class="phone-link" href="tel:{profile.phone}">
						<strong>{profile.phone}</strong>
					</a>
				{/if}
			</p>
		</section>
	{/if}

	{#if profile.reviews.length}
		<section class="section">
			<h3 class="title">Reviews</h3>
			<ul class="reviews">
				{#each profile.reviews as review (review.id)}
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

	<ProfileContactBar
		{messageHref}
		{callHref}
		{reviewHref}
		{reportHref}
		{blockHref}
		{...messageDraftKey ? { messageDraftKey } : {}}
	/>
</article>

<style>
	.profile-view[data-preview='true'] {
		background: var(--color-paper);
		border-radius: var(--radius-card);
		overflow: hidden;
		box-shadow: var(--shadow-card);
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
	.contact-copy {
		margin: 0 0 var(--space-sm);
		color: var(--color-stone);
	}
	.phone-line {
		margin: 0;
		color: var(--color-stone);
	}
	.phone-link {
		color: inherit;
		text-decoration: none;
	}
	.phone-link strong,
	.phone-number {
		color: var(--color-ink);
		font-variant-numeric: tabular-nums;
	}
	.phone-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: 4px;
	}
</style>
