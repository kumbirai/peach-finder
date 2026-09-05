<script lang="ts">
	import AvailabilityPill from '$lib/components/AvailabilityPill.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ProfileContactBar from '$lib/components/ProfileContactBar.svelte';
	import ProfileSafetyActions from '$lib/components/ProfileSafetyActions.svelte';
	import { resolveCallHref } from '$lib/contact-actions';
	import {
		formatOnlineStatus,
		formatRatingLabel,
		formatResponseTime,
		formatReviewDate,
		reviewerInitialName
	} from '$lib/profile-display';
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

	let selectedPhotoIndex = $state(0);

	const photos = $derived(profile.photos);
	const selectedPhoto = $derived(photos[selectedPhotoIndex] ?? photos[0]);

	const callHref = $derived(resolveCallHref(profile.phone, previewMode));
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

	const ratingLabel = $derived(formatRatingLabel(profile.rating));
	const onlineLabel = $derived(formatOnlineStatus(profile.onlineStatus));
	const responseLabel = $derived(formatResponseTime(profile.responseTime));
</script>

<article
	class="profile-view"
	data-preview={previewMode ? 'true' : undefined}
	data-testid="profile-view"
>
	<section class="gallery" aria-label="Photos">
		{#if selectedPhoto}
			<img class="hero" src={selectedPhoto.url} alt="" data-testid="profile-hero-photo" />
		{:else}
			<div class="hero placeholder" data-testid="profile-photo-placeholder">
				<svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="8" r="4" stroke="#B34625" stroke-width="1.5" />
					<path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke="#B34625" stroke-width="1.5" />
				</svg>
				<span class="ph-label">Photo placeholder</span>
			</div>
		{/if}
		{#if photos.length > 1}
			<div class="gallery-thumbs" role="list" aria-label="Photo thumbnails">
				{#each photos as photo, index (photo.id)}
					<button
						type="button"
						class="thumb"
						class:selected={index === selectedPhotoIndex}
						aria-label="Show photo {index + 1} of {photos.length}"
						aria-current={index === selectedPhotoIndex ? 'true' : undefined}
						onclick={() => {
							selectedPhotoIndex = index;
						}}
					>
						<img src={photo.url} alt="" />
					</button>
				{/each}
			</div>
		{/if}
	</section>

	<header class="profile-header">
		{#if primaryHeading}
			<h1 class="display page-title" data-testid="profile-name">{profile.displayName}</h1>
		{:else}
			<h2 class="display" data-testid="profile-name">{profile.displayName}</h2>
		{/if}

		<div class="badges" data-testid="profile-trust-badges">
			{#if profile.badges.identityVerified}
				<Badge kind="verified" />
			{/if}
			{#if profile.badges.activeThisWeek}
				<Badge kind="active-week" />
			{/if}
		</div>

		<p class="stats" data-testid="profile-stats">
			<span class="stars" aria-label="Rating {ratingLabel}" data-testid="profile-rating">
				&#9733; <strong>{ratingLabel}</strong>
			</span>
			{#if profile.availability.state === 'available'}
				<AvailabilityPill setAt={profile.availability.setAt} />
			{/if}
			{#if onlineLabel}
				<span data-testid="profile-online-status"><strong>{onlineLabel}</strong></span>
			{/if}
			{#if responseLabel}
				<span data-testid="profile-response-time">{responseLabel}</span>
			{/if}
			{#if profile.area}
				<span>{profile.area.name}</span>
			{/if}
		</p>
	</header>

	{#if actions && !previewMode}
		<ProfileSafetyActions {reviewHref} {reportHref} {blockHref} />
	{/if}

	<section class="section" aria-labelledby="about-heading-{profile.id}">
		<h3 id="about-heading-{profile.id}" class="title">About</h3>
		<p data-testid="profile-intro">{profile.intro}</p>
	</section>

	{#if profile.services.length}
		<section class="section" aria-labelledby="services-heading-{profile.id}">
			<h3 id="services-heading-{profile.id}" class="title">Services</h3>
			<ul class="services" data-testid="profile-services">
				{#each profile.services as service (service.id)}
					<li>
						<strong>{service.name}</strong>
						{#if service.description}
							<span class="service-description"> — {service.description}</span>
						{/if}
						<span class="service-price">
							R{(service.priceCents / 100).toFixed(0)} · {service.durationMinutes} min
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if profile.tags.length}
		<section class="section" aria-labelledby="tags-heading-{profile.id}">
			<h3 id="tags-heading-{profile.id}" class="title">Specialties</h3>
			<div class="tags" data-testid="profile-tags">
				{#each profile.tags as tag (tag.id)}
					<span class="tag label">{tag.name}</span>
				{/each}
			</div>
		</section>
	{/if}

	{#if profile.languages.length}
		<section class="section" aria-labelledby="languages-heading-{profile.id}">
			<h3 id="languages-heading-{profile.id}" class="title">Languages</h3>
			<p data-testid="profile-languages">{profile.languages.map((l) => l.name).join(', ')}</p>
		</section>
	{/if}

	{#if profile.phone}
		<section class="section" aria-labelledby="contact-heading-{profile.id}">
			<h3 id="contact-heading-{profile.id}" class="title">Contact</h3>
			<p class="contact-copy">
				{profile.displayName.split(' ')[0]} has chosen to share a phone number with people browsing Peach
				Finder.
			</p>
			<p class="phone-line" data-testid="profile-phone">
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
		<section class="section" aria-labelledby="reviews-heading-{profile.id}">
			<h3 id="reviews-heading-{profile.id}" class="title">Reviews</h3>
			<ul class="reviews" data-testid="profile-reviews">
				{#each profile.reviews as review (review.id)}
					<li>
						<p class="review-meta">
							<span class="review-name">{reviewerInitialName(review.reviewerName)}</span>
							<span class="stars" aria-label="{review.rating} out of 5 stars">
								{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
							</span>
						</p>
						<p>{review.body}</p>
						<p class="review-date">{formatReviewDate(review.createdAt)}</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<ProfileContactBar
		{messageHref}
		{callHref}
		displayName={profile.displayName}
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
	.gallery {
		padding: 0 var(--space-lg);
	}
	.gallery .hero {
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
		display: block;
		background: var(--color-blush);
		border-radius: var(--radius-lg);
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		color: var(--color-stone);
	}
	.ph-label {
		font-size: 0.875rem;
	}
	.gallery-thumbs {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
		overflow-x: auto;
	}
	.thumb {
		width: 72px;
		height: 72px;
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
		cursor: pointer;
		background: var(--color-blush);
	}
	.thumb:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.thumb.selected {
		border-color: var(--color-peach-deep);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.profile-header {
		padding: var(--space-lg);
		display: grid;
		gap: var(--space-sm);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		color: var(--color-stone);
		font-size: 0.9375rem;
		margin: 0;
		align-items: center;
	}
	.stats strong {
		color: var(--color-ink);
	}
	.stars {
		color: var(--color-peach-deep);
	}
	.section {
		padding: var(--space-lg);
		border-top: 1px solid var(--color-divider);
	}
	.section .title {
		font-family: var(--font-body-family);
		font-weight: 600;
		font-size: 1rem;
		margin: 0 0 var(--space-sm);
	}
	.section p {
		max-width: 70ch;
		margin: 0;
	}
	.services,
	.reviews {
		margin: 0;
		padding-left: 0;
		list-style: none;
		display: grid;
		gap: var(--space-md);
	}
	.services li {
		display: grid;
		gap: 2px;
	}
	.service-description {
		color: var(--color-stone);
	}
	.service-price {
		color: var(--color-stone);
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
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		margin: 0 0 var(--space-xs);
	}
	.review-name {
		font-weight: 600;
	}
	.review-date {
		margin-top: var(--space-xs);
		color: var(--color-stone);
		font-size: 0.875rem;
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
