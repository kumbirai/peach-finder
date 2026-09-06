<script lang="ts">
	type DocKind = 'id' | 'selfie';

	let {
		disabled = false,
		onChange
	}: {
		disabled?: boolean;
		onChange?: (state: { idPhotoId: string | null; selfiePhotoId: string | null }) => void;
	} = $props();

	let idPhotoId = $state<string | null>(null);
	let selfiePhotoId = $state<string | null>(null);

	let uploadingKind = $state<DocKind | null>(null);
	let errorMessage = $state<string | null>(null);
	let idInput: HTMLInputElement | undefined = $state();
	let selfieInput: HTMLInputElement | undefined = $state();

	function emitChange() {
		onChange?.({ idPhotoId, selfiePhotoId });
	}

	async function upload(kind: DocKind, file: File) {
		errorMessage = null;
		uploadingKind = kind;
		try {
			const form = new FormData();
			form.append('file', file);
			form.append('docKind', kind);

			const res = await fetch('/api/media/identity-docs', { method: 'POST', body: form });
			const body = await res.json();
			if (!res.ok) {
				errorMessage =
					body?.error?.message ??
					body?.error?.fields?.[0]?.message ??
					'Could not upload this photo.';
				return;
			}

			const photoId = body.data.photoId as string;
			if (kind === 'id') {
				idPhotoId = photoId;
			} else {
				selfiePhotoId = photoId;
			}
			emitChange();
		} catch {
			errorMessage = 'Could not upload this photo. Check your connection and try again.';
		} finally {
			uploadingKind = null;
		}
	}

	function onPick(kind: DocKind, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void upload(kind, file);
		input.value = '';
	}

	function openPicker(kind: DocKind) {
		if (disabled || uploadingKind) return;
		if (kind === 'id') idInput?.click();
		else selfieInput?.click();
	}
</script>

<div class="uploader">
	<input
		bind:this={idInput}
		type="file"
		accept="image/*"
		class="visually-hidden"
		aria-hidden="true"
		tabindex="-1"
		onchange={(event) => onPick('id', event)}
	/>
	<input
		bind:this={selfieInput}
		type="file"
		accept="image/*"
		class="visually-hidden"
		aria-hidden="true"
		tabindex="-1"
		onchange={(event) => onPick('selfie', event)}
	/>

	<div class="upload-grid">
		<button
			type="button"
			class="upload-dropzone"
			class:upload-dropzone--ready={Boolean(idPhotoId)}
			aria-pressed={Boolean(idPhotoId)}
			disabled={disabled || uploadingKind !== null}
			data-testid="verify-upload-id"
			onclick={() => openPicker('id')}
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
			<span
				>{uploadingKind === 'id' ? 'Uploading…' : idPhotoId ? 'ID photo added' : 'ID photo'}</span
			>
		</button>

		<button
			type="button"
			class="upload-dropzone"
			class:upload-dropzone--ready={Boolean(selfiePhotoId)}
			aria-pressed={Boolean(selfiePhotoId)}
			disabled={disabled || uploadingKind !== null}
			data-testid="verify-upload-selfie"
			onclick={() => openPicker('selfie')}
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
			<span
				>{uploadingKind === 'selfie'
					? 'Uploading…'
					: selfiePhotoId
						? 'Selfie added'
						: 'Selfie'}</span
			>
		</button>
	</div>

	{#if errorMessage}
		<p class="error label" role="alert">{errorMessage}</p>
	{/if}
</div>

<style>
	.uploader {
		display: grid;
		gap: var(--space-sm);
	}
	.upload-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(96px, 160px));
		gap: var(--space-md);
	}
	.upload-dropzone {
		display: grid;
		place-items: center;
		gap: var(--space-xs);
		min-height: 7.5rem;
		padding: var(--space-md);
		border: 1.5px dashed var(--color-stone);
		border-radius: 14px;
		background: var(--color-cream);
		color: var(--color-ink);
		font: inherit;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.upload-dropzone:hover:not(:disabled),
	.upload-dropzone:focus-visible {
		border-color: var(--color-peach-deep);
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.upload-dropzone--ready {
		border-style: solid;
		border-color: var(--color-pine);
		background: color-mix(in srgb, var(--color-pine) 8%, var(--color-cream));
		color: var(--color-pine);
	}
	.upload-dropzone:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.error {
		margin: 0;
		color: var(--color-peach-deep);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.upload-dropzone {
			transition: none;
		}
	}
</style>
