<script lang="ts">
	import AdminInkStrip from '$lib/components/AdminInkStrip.svelte';

	let { children } = $props();
</script>

<AdminInkStrip />
{@render children()}
