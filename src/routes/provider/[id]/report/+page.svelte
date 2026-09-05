<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import ReportReasonForm from '$lib/components/ReportReasonForm.svelte';
	import { PROFILE_REPORT_INTRO, PROFILE_REPORT_SUCCESS_COPY } from '$lib/safety/report-flow';
	import type { ReportReasonValue } from '$lib/safety/report-flow';

	let {
		data
	}: {
		data: {
			providerProfileId: string;
			displayName: string;
			profilePath: string;
		};
	} = $props();

	let panelCopy = $state(PROFILE_REPORT_INTRO);
	let busy = $state(false);
	let statusMessage = $state('');
	let statusRole = $state<'status' | 'alert'>('status');
	let submitted = $state(false);

	async function submitReport(input: {
		reason: ReportReasonValue;
		freeText?: string;
	}): Promise<void> {
		busy = true;
		statusMessage = '';
		try {
			const response = await fetch('/api/trust/reports', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					targetType: 'profile',
					targetId: data.providerProfileId,
					reason: input.reason,
					freeText: input.freeText ?? undefined
				})
			});
			const json = (await response.json()) as { error?: { message: string } };
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? 'Could not send report.';
				return;
			}
			panelCopy = PROFILE_REPORT_SUCCESS_COPY;
			submitted = true;
		} catch {
			statusRole = 'alert';
			statusMessage = 'Could not send report.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Report {data.displayName} — Peach Finder</title>
</svelte:head>

<Navigation current="search" />

<main class="page">
	<header class="page-header">
		<h1 class="display">Report profile</h1>
		<p class="intro">{data.displayName}</p>
	</header>

	<section class="panel" data-testid="profile-report-panel">
		<p>{panelCopy}</p>
		{#if !submitted}
			<ReportReasonForm {busy} onSubmit={submitReport} />
		{:else}
			<Button href={data.profilePath} variant="secondary">Back to profile</Button>
		{/if}
	</section>

	{#if statusMessage}
		<p class="status label" role={statusRole}>{statusMessage}</p>
	{/if}
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-lg) 5rem;
	}
	.page-header {
		display: grid;
		gap: var(--space-xs);
		margin-bottom: var(--space-lg);
	}
	.intro {
		color: var(--color-stone);
		margin: 0;
	}
	.panel {
		display: grid;
		gap: var(--space-md);
		padding: var(--space-lg);
		background: var(--color-blush);
		border-radius: var(--radius-md);
	}
	.panel p {
		margin: 0;
		color: var(--color-stone);
		font-size: 0.9375rem;
	}
	.status {
		margin: var(--space-sm) 0 0;
		color: var(--color-stone);
	}
</style>
