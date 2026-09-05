<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import {
		COPY_PROFILE_LINK_LABEL,
		LINK_COPIED_LABEL,
		profileShareFeedbackDelayMs,
		readPrefersReducedMotion
	} from '$lib/profile-share-button';
	import { canUseNativeShare, copyProfileLink, shareProfileLink } from '$lib/share-profile';
	import { onDestroy } from 'svelte';

	let {
		url,
		title
	}: {
		url: string;
		title: string;
	} = $props();

	let label = $state(COPY_PROFILE_LINK_LABEL);
	let resetTimeout: ReturnType<typeof setTimeout> | undefined;

	function scheduleLabelReset() {
		if (resetTimeout) clearTimeout(resetTimeout);
		resetTimeout = setTimeout(() => {
			label = COPY_PROFILE_LINK_LABEL;
		}, profileShareFeedbackDelayMs(readPrefersReducedMotion()));
	}

	async function onShareClick() {
		try {
			await copyProfileLink(url);
			label = LINK_COPIED_LABEL;
			scheduleLabelReset();
			return;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}
		}

		if (!canUseNativeShare()) {
			return;
		}

		try {
			await shareProfileLink(url, title);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}
		}
	}

	onDestroy(() => {
		if (resetTimeout) clearTimeout(resetTimeout);
	});
</script>

<Button variant="secondary" onclick={() => void onShareClick()}>
	{label}
</Button>
