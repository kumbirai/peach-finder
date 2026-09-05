<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import PublicProfileView from '$lib/components/PublicProfileView.svelte';

	let {
		data
	}: {
		data: {
			profile: import('$lib/types/profile').PublicProfile;
			providerProfileId: string;
			shareUrl: string;
			actions: { message: string; review: string; report: string; block: string };
			showMessage: boolean;
			og: { title: string; description: string; image: string | null };
			canonical: string;
		};
	} = $props();
</script>

<svelte:head>
	<title>{data.profile.displayName} — Peach Finder</title>
	<meta name="description" content={data.og.description} />
	<meta property="og:title" content={data.og.title} />
	<meta property="og:description" content={data.og.description} />
	<meta property="og:url" content={data.canonical} />
	<meta property="og:type" content="profile" />
	{#if data.og.image}
		<meta property="og:image" content={data.og.image} />
	{/if}
</svelte:head>

<Navigation current="search" />

<main class="page">
	<PublicProfileView
		profile={data.profile}
		primaryHeading
		shareUrl={data.shareUrl}
		actions={data.actions}
		showMessage={data.showMessage}
		messageDraftKey={`pf_message_draft_${data.providerProfileId}`}
	/>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding-bottom: 5rem;
	}
</style>
