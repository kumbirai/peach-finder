<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import PublicProfileView from '$lib/components/PublicProfileView.svelte';

	let {
		data
	}: {
		data: {
			profile: import('$lib/types/profile').PublicProfile;
			providerProfileId: string;
			actions: { message: string; review: string; report: string; block: string };
		};
	} = $props();
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
	<PublicProfileView
		profile={data.profile}
		primaryHeading
		actions={data.actions}
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
