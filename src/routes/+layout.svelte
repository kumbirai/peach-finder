<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import '$lib/styles/app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Peach Finder</title>
</svelte:head>

<div class="app-shell">
	<div class="app-content">
		{@render children()}
	</div>
	<SiteFooter />
</div>

<style>
	.app-shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.app-content {
		flex: 1 0 auto;
	}
</style>
