<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import IdentityDocUploader from '$lib/components/provider/IdentityDocUploader.svelte';
	import VerificationStatusBanner from '$lib/components/provider/VerificationStatusBanner.svelte';
	import type { VerificationOwnerStatus } from '$lib/server/modules/trust-and-safety/domain/verification-status';

	let {
		data
	}: {
		data: {
			profile: { profileId: string; displayName: string } | null;
			verification: {
				status: VerificationOwnerStatus;
				rejectionReason: string | null;
			} | null;
		};
	} = $props();

	let idPhotoId = $state<string | null>(null);
	let selfiePhotoId = $state<string | null>(null);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);

	const canSubmit = $derived(
		Boolean(
			data.verification &&
			(data.verification.status === 'never_submitted' || data.verification.status === 'rejected') &&
			idPhotoId &&
			selfiePhotoId &&
			!submitting
		)
	);

	const submitLabel = $derived(
		data.verification?.status === 'rejected' ? 'Resubmit for review' : 'Submit for review'
	);

	async function submitClaim() {
		if (!idPhotoId || !selfiePhotoId) return;
		submitError = null;
		submitting = true;
		try {
			const path =
				data.verification?.status === 'rejected'
					? '/api/trust/verification/resubmit'
					: '/api/trust/verification';
			const res = await fetch(path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ docPhotoIds: [idPhotoId, selfiePhotoId] })
			});
			const body = await res.json();
			if (!res.ok) {
				submitError = body?.error?.message ?? 'Could not submit your documents.';
				return;
			}
			await goto('/provider/dashboard');
		} catch {
			submitError = 'Could not submit your documents. Check your connection and try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Identity verification — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page">
	<p class="back-row">
		<Button variant="secondary" href="/provider/dashboard">Back to dashboard</Button>
	</p>

	<h1 class="headline">Identity verification</h1>

	{#if data.profile && data.verification}
		<VerificationStatusBanner
			status={data.verification.status}
			rejectionReason={data.verification.rejectionReason}
		/>

		<Card>
			{#if data.verification.status === 'pending'}
				<p class="body">
					We are reviewing your documents. You cannot upload replacements while a submission is
					pending.
				</p>
			{:else if data.verification.status === 'approved'}
				<p class="body">
					No further action is needed. If you change your verified name or phone number, your badge
					may be hidden until an admin re-reviews your profile.
				</p>
			{:else}
				<p class="field-label" id="id-upload-label">Government-issued ID (photo)</p>
				<IdentityDocUploader
					disabled={submitting}
					onChange={(state) => {
						idPhotoId = state.idPhotoId;
						selfiePhotoId = state.selfiePhotoId;
					}}
				/>
				<p class="body privacy-copy">
					Your documents are stored separately from your public profile, viewed only by an admin
					during review, and are never shown anywhere in the product. They are deleted automatically
					after review.
				</p>

				{#if submitError}
					<p class="error label" role="alert">{submitError}</p>
				{/if}

				<div class="actions">
					<Button
						variant="primary"
						type="button"
						disabled={!canSubmit}
						onclick={() => void submitClaim()}
					>
						{submitting ? 'Submitting…' : submitLabel}
					</Button>
				</div>
			{/if}
		</Card>
	{/if}
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-lg);
	}
	.back-row {
		margin: 0;
	}
	.field-label {
		display: block;
		margin: 0 0 var(--space-sm);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-ink);
	}
	.privacy-copy {
		margin: var(--space-md) 0 0;
		color: var(--color-stone);
		font-size: 0.9375rem;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-lg);
	}
	.error {
		margin: var(--space-sm) 0 0;
		color: var(--color-peach-deep);
	}
</style>
