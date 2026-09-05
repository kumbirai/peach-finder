<script lang="ts">
	import AvailabilityPill from '$lib/components/AvailabilityPill.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import { formatDistanceKm } from '$lib/format-distance';
	import type { SearchCard } from '$lib/types/discovery';

	let { card }: { card: SearchCard } = $props();

	const ratingValue = $derived('state' in card.rating ? null : card.rating.average.toFixed(1));
	const ratingLabel = $derived(
		'state' in card.rating ? 'New' : `${card.rating.average.toFixed(1)} (${card.rating.count})`
	);
	const reviewMeta = $derived(
		'state' in card.rating
			? 'New'
			: `${card.rating.count} review${card.rating.count === 1 ? '' : 's'}`
	);
	const distanceLabel = $derived(
		card.distanceKm != null ? `${formatDistanceKm(card.distanceKm)} away` : card.areaName
	);
	const priceMeta = $derived(
		card.priceFromCents != null ? `From R${(card.priceFromCents / 100).toFixed(0)}` : null
	);
	const messageLabel = $derived(`Message ${card.displayName.split(' ')[0] ?? card.displayName}`);
	const profileHref = $derived(`/provider/${card.providerProfileId}`);
</script>

<Card>
	<div class="photo-wrap">
		<a class="profile-link" href={profileHref} aria-label="View {card.displayName}'s profile">
			{#if card.photoUrl}
				<img class="card-photo" src={card.photoUrl} alt="" loading="lazy" />
			{:else}
				<div class="card-photo placeholder" aria-hidden="true">Photo placeholder</div>
			{/if}
		</a>
		<div class="photo-scrim" aria-hidden="true"></div>
		<div class="pill-row">
			{#if card.availability.state === 'available'}
				<AvailabilityPill setAt={card.availability.setAt} />
			{:else}
				<span class="unavailable-pill" data-testid="unavailable-pill">
					<span class="dot" aria-hidden="true"></span>
					<span class="text">Not available</span>
				</span>
			{/if}
			{#if card.isFeatured}
				<span class="featured label" data-testid="featured-label">
					<svg
						class="spark"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2z" />
					</svg>
					Featured
				</span>
			{/if}
		</div>
	</div>
	<div class="card-body">
		<div class="title-row">
			<h2 class="title">
				<a class="profile-link" href={profileHref}>{card.displayName}</a>
			</h2>
			<span class="rating" aria-label="Rating {ratingLabel}">
				<span class="stars" aria-hidden="true">&#9733;</span>
				{ratingValue ?? 'New'}
			</span>
		</div>
		<p class="meta">
			<span>{distanceLabel}</span>
			<span>{reviewMeta}</span>
			{#if priceMeta}
				<span>{priceMeta}</span>
			{/if}
		</p>
		{#if card.introExtract}
			<p class="intro" data-testid="card-intro">{card.introExtract}</p>
		{/if}
		<div class="badges">
			{#if card.badges.identityVerified}
				<Badge kind="verified" />
			{/if}
			{#if card.badges.activeThisWeek}
				<Badge kind="active-week" />
			{/if}
		</div>
		{#if card.languages.length}
			<div class="language-tags" data-testid="card-languages">
				{#each card.languages as language (language)}
					<span class="language-tag label">{language}</span>
				{/each}
			</div>
		{/if}
		<div class="actions">
			<Button href={card.messageHref} variant="primary">
				{messageLabel}
			</Button>
		</div>
	</div>
</Card>

<style>
	.photo-wrap {
		position: relative;
	}
	.profile-link {
		display: block;
		color: inherit;
		text-decoration: none;
	}
	.photo-scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			rgba(43, 38, 34, 0.12) 0%,
			rgba(43, 38, 34, 0) 35%,
			rgba(43, 38, 34, 0) 55%,
			rgba(43, 38, 34, 0.18) 100%
		);
		pointer-events: none;
	}
	.pill-row {
		position: absolute;
		top: var(--space-sm);
		left: var(--space-sm);
		right: var(--space-sm);
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: flex-start;
		z-index: 1;
	}
	.unavailable-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--color-paper);
		color: var(--color-stone);
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		border-radius: var(--radius-pill);
		padding: 4px 10px 4px 8px;
		box-shadow: var(--shadow-ambient-rest);
	}
	.unavailable-pill .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-stone);
		flex-shrink: 0;
	}
	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-bottom: 4px;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}
	.title {
		font-family: var(--font-body-family);
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		margin: 0;
		min-width: 0;
	}
	.title .profile-link {
		color: var(--color-ink);
	}
	.rating {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-ink);
		flex-shrink: 0;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		color: var(--color-stone);
		margin: 0;
		font-size: 0.875rem;
	}
	.intro {
		margin: var(--space-sm) 0 0;
		color: var(--color-ink);
		font-size: 0.875rem;
		line-height: 1.45;
	}
	.stars {
		color: var(--color-peach-deep);
	}
	.featured {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: var(--color-ink);
		color: var(--color-paper);
		font-weight: 600;
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		border-radius: var(--radius-pill);
		padding: 4px 10px;
	}
	.spark {
		flex-shrink: 0;
	}
	.language-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: var(--space-sm);
	}
	.language-tag {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-pine);
		background: var(--color-blush);
		border-radius: var(--radius-pill);
		padding: 3px 10px;
	}
	.actions {
		margin-top: var(--space-md);
		position: relative;
		z-index: 2;
	}
	.actions :global(.btn) {
		width: 100%;
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-blush);
		color: var(--color-stone);
		font-size: 0.875rem;
	}
</style>
