<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import PhotoUploader from '$lib/components/onboarding/PhotoUploader.svelte';

	let {
		data,
		form
	}: {
		data: {
			profile: {
				profileId: string;
				intro: string | null;
				identityBadgeNotice: { suppressed: boolean; message: string | null };
				photos: Array<{ id: string; photoId: string; isPrimary: boolean; cardUrl: string }>;
			};
			introMaxLength: number;
		};
		form?: {
			saved?: boolean;
			intro?: string;
			message?: string;
			issues?: Array<{ path: string; message: string }>;
		};
	} = $props();

	const saveMessage = $derived(
		form?.saved ? 'Saved — your profile is live now.' : (form?.message ?? null)
	);
	let introValue = $state(data.profile.intro ?? '');

	$effect(() => {
		if (form?.intro !== undefined) {
			introValue = form.intro;
		}
	});
</script>

<svelte:head>
	<title>Edit profile — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page">
	<h1 class="headline">Edit your profile</h1>
	<p class="body intro">
		Every change saves straight to your live listing. Nothing goes into review or draft.
	</p>

	{#if data.profile.identityBadgeNotice.suppressed && data.profile.identityBadgeNotice.message}
		<Card>
			<p class="notice label" role="status">{data.profile.identityBadgeNotice.message}</p>
		</Card>
	{/if}

	<section class="section" aria-labelledby="photos-heading">
		<h2 id="photos-heading" class="title">Photos</h2>
		<Card>
			<PhotoUploader photos={data.profile.photos} />
			<p class="body hint">
				Photo changes appear on your public profile as soon as they finish processing.
			</p>
		</Card>
	</section>

	<section class="section" aria-labelledby="intro-heading">
		<h2 id="intro-heading" class="title">Introduction</h2>
		<Card>
			{#if saveMessage}
				<p class="success label" role="status">{saveMessage}</p>
			{/if}
			{#if form?.issues?.length}
				<p class="error label" role="alert">{form.issues[0]?.message}</p>
			{/if}
			<form class="form" method="POST" action="?/saveIntro" use:enhance>
				<label class="field" for="introField">
					<span class="label">Tell seekers what makes your work special</span>
					<textarea
						id="introField"
						name="intro"
						class="textarea"
						bind:value={introValue}
						maxlength={data.introMaxLength}
						rows="6"></textarea>
					<span class="counter label">{introValue.length}/{data.introMaxLength}</span>
				</label>
				<Button type="submit" variant="primary">Save introduction</Button>
			</form>
		</Card>
	</section>

	<section class="section" aria-labelledby="more-heading">
		<h2 id="more-heading" class="title">More profile details</h2>
		<Card>
			<p class="body">Update services, languages, and area from the onboarding checklist.</p>
			<Button href="/provider/onboarding" variant="secondary">Open profile checklist</Button>
		</Card>
	</section>

	<p class="body actions">
		<Button href={`/provider/${data.profile.profileId}`} variant="secondary"
			>Preview public profile</Button
		>
		<Button href="/provider/dashboard" variant="ghost">Back to dashboard</Button>
	</p>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-xl);
	}
	.intro {
		margin: 0;
		color: var(--color-stone);
	}
	.section {
		display: grid;
		gap: var(--space-md);
	}
	.form {
		display: grid;
		gap: var(--space-md);
	}
	.field {
		display: grid;
		gap: var(--space-xs);
	}
	.textarea {
		width: 100%;
		padding: var(--space-md);
		border: 1px solid var(--color-stone-light);
		border-radius: 14px;
		font: inherit;
		line-height: 1.5;
		resize: vertical;
		min-height: 8rem;
	}
	.textarea:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.counter {
		color: var(--color-stone);
	}
	.hint {
		margin: var(--space-md) 0 0;
		color: var(--color-stone);
	}
	.notice {
		margin: 0;
		color: var(--color-peach-deep);
	}
	.success {
		margin: 0 0 var(--space-sm);
		color: var(--color-pine);
	}
	.error {
		margin: 0 0 var(--space-sm);
		color: var(--color-peach-deep);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin: 0;
	}
</style>
