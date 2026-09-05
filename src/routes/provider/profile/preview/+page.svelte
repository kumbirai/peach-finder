<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import PublicProfileView from '$lib/components/PublicProfileView.svelte';
	import type { PublicProfile } from '$lib/types/profile';

	let {
		data
	}: {
		data: {
			profileId: string;
			phoneVisible: boolean;
			anonymousPreview: PublicProfile;
			seekerPreview: PublicProfile;
		};
	} = $props();
</script>

<svelte:head>
	<title>Preview as seeker — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page">
	<header class="page-header">
		<h1 class="headline">Preview as seeker</h1>
		<p class="body intro">
			See exactly what each audience sees on your profile. The only difference is whether your phone
			number appears — controlled by your
			<a class="inline-link" href="/provider/profile/edit#phone-heading">phone visibility setting</a
			>
			({data.phoneVisible
				? 'currently shown to everyone'
				: 'hidden from visitors without an account'}).
		</p>
	</header>

	<div class="preview-grid">
		<section class="preview-panel" aria-labelledby="anonymous-heading">
			<Card>
				<div class="panel-label">
					<p id="anonymous-heading" class="audience-label label">Visitors without an account</p>
					<p class="audience-hint body">
						What someone sees when they browse Peach Finder without signing in.
					</p>
				</div>
			</Card>
			<PublicProfileView profile={data.anonymousPreview} previewMode />
		</section>

		<section class="preview-panel" aria-labelledby="seeker-heading">
			<Card>
				<div class="panel-label">
					<p id="seeker-heading" class="audience-label label">Signed-in seekers</p>
					<p class="audience-hint body">
						What someone with a Peach Finder account sees on your profile.
					</p>
				</div>
			</Card>
			<PublicProfileView profile={data.seekerPreview} previewMode />
		</section>
	</div>

	<p class="actions body">
		<Button href="/provider/profile/edit" variant="secondary">Edit profile</Button>
		<Button href={`/provider/${data.profileId}`} variant="ghost">Open live profile</Button>
		<Button href="/provider/dashboard" variant="ghost">Back to dashboard</Button>
	</p>
</main>

<style>
	.page {
		max-width: 56rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-xl);
	}
	.page-header {
		display: grid;
		gap: var(--space-sm);
	}
	.intro {
		margin: 0;
		color: var(--color-stone);
	}
	.inline-link {
		color: var(--color-peach-deep);
		text-underline-offset: 2px;
	}
	.inline-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.preview-grid {
		display: grid;
		gap: var(--space-xl);
	}
	.preview-panel {
		display: grid;
		gap: var(--space-md);
	}
	.panel-label {
		display: grid;
		gap: var(--space-xs);
	}
	.audience-label {
		margin: 0;
		color: var(--color-ink);
		font-weight: 600;
	}
	.audience-hint {
		margin: 0;
		color: var(--color-stone);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin: 0;
	}
	@media (min-width: 900px) {
		.preview-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
		}
	}
</style>
