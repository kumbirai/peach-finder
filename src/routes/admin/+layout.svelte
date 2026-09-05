<script lang="ts">
	import AdminInkStrip from '$lib/components/AdminInkStrip.svelte';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import { page } from '$app/stores';

	let { children } = $props();

	const showConsoleChrome = $derived(!$page.url.pathname.startsWith('/admin/login'));
</script>

{#if showConsoleChrome}
	<AdminInkStrip />
	<AdminNav />
{/if}
{@render children()}
