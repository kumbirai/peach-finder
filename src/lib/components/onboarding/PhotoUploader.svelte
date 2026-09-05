<script lang="ts">
	type GalleryPhoto = {
		id: string;
		photoId: string;
		isPrimary: boolean;
		cardUrl: string;
	};

	let {
		photos = [],
		maxPhotos = 12,
		onUploaded
	}: {
		photos?: GalleryPhoto[];
		maxPhotos?: number;
		onUploaded?: () => void;
	} = $props();

	let uploading = $state(false);
	let errorMessage = $state<string | null>(null);
	let fileInput: HTMLInputElement | undefined = $state();

	async function uploadFile(file: File) {
		errorMessage = null;
		uploading = true;
		try {
			const form = new FormData();
			form.append('file', file);
			form.append('scope', 'profile_photo');

			const uploadRes = await fetch('/api/media/uploads', { method: 'POST', body: form });
			const uploadBody = await uploadRes.json();
			if (!uploadRes.ok) {
				errorMessage =
					uploadBody?.error?.message ??
					uploadBody?.error?.fields?.[0]?.message ??
					'Could not upload this photo.';
				return;
			}

			const photoId = uploadBody.data.photoId as string;
			const attachRes = await fetch('/api/provider/profile/photos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ photoId })
			});
			const attachBody = await attachRes.json();
			if (!attachRes.ok) {
				errorMessage = attachBody?.error?.message ?? 'Could not add photo to your gallery.';
				return;
			}

			onUploaded?.();
		} catch {
			errorMessage = 'Could not upload this photo. Check your connection and try again.';
		} finally {
			uploading = false;
		}
	}

	function onPickFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void uploadFile(file);
		input.value = '';
	}

	function openPicker() {
		fileInput?.click();
	}

	async function makePrimary(photoId: string) {
		await fetch(`/api/provider/profile/photos/${photoId}/primary`, { method: 'PUT' });
		onUploaded?.();
	}

	async function removePhoto(photoId: string) {
		await fetch(`/api/provider/profile/photos/${photoId}`, { method: 'DELETE' });
		onUploaded?.();
	}
</script>

<div class="gallery">
	<div class="upload-grid">
		{#each photos as photo (photo.id)}
			<div class="upload-thumb" data-testid="gallery-thumb">
				<img src={photo.cardUrl} alt="" class="thumb-img" />
				{#if photo.isPrimary}
					<span class="primary-tag label">Primary</span>
				{:else}
					<button
						type="button"
						class="make-primary label"
						onclick={() => makePrimary(photo.photoId)}
					>
						Make primary
					</button>
				{/if}
				<button
					type="button"
					class="remove-photo label"
					aria-label="Remove photo"
					onclick={() => removePhoto(photo.photoId)}>Remove</button
				>
			</div>
		{/each}
		{#if photos.length < maxPhotos}
			<button
				type="button"
				class="upload-dropzone"
				disabled={uploading}
				onclick={openPicker}
				aria-busy={uploading}
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 5v14M5 12h14"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				{uploading ? 'Uploading…' : 'Add photo'}
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/jpeg,image/png,image/webp,image/heic,.heic"
				class="sr-only"
				aria-label="Upload profile photo"
				onchange={onPickFile}
			/>
		{/if}
	</div>
	{#if errorMessage}
		<p class="form-error" role="alert">{errorMessage}</p>
	{/if}
	{#if photos.length > 1}
		<p class="hint body">Tap “Make primary” to choose which photo seekers see first.</p>
	{/if}
</div>

<style>
	.upload-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: var(--space-sm);
	}
	.upload-dropzone {
		aspect-ratio: 1 / 1;
		border: 1.5px dashed var(--color-divider);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		color: var(--color-stone);
		background: none;
		font-family: var(--font-body-family);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		min-height: 44px;
		width: 100%;
	}
	.upload-dropzone:hover:not(:disabled) {
		border-color: var(--color-peach-deep);
		color: var(--color-peach-deep);
	}
	.upload-dropzone:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.upload-dropzone:disabled {
		opacity: 0.7;
		cursor: wait;
	}
	.upload-thumb {
		position: relative;
		aspect-ratio: 1 / 1;
		border-radius: var(--radius-md);
		background: linear-gradient(155deg, var(--color-blush) 0%, #ecd2bd 100%);
		overflow: hidden;
	}
	.thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.primary-tag,
	.make-primary,
	.remove-photo {
		position: absolute;
		font-size: 0.625rem;
		padding: 2px 6px;
		border-radius: var(--radius-pill);
		border: none;
		cursor: pointer;
		min-height: 24px;
	}
	.primary-tag {
		bottom: 4px;
		left: 4px;
		background: var(--color-ink);
		color: var(--color-paper);
	}
	.make-primary {
		bottom: 4px;
		left: 4px;
		background: var(--color-paper);
		color: var(--color-ink);
	}
	.remove-photo {
		top: 4px;
		right: 4px;
		background: var(--color-paper);
		color: var(--color-peach-deep);
	}
	.form-error {
		color: var(--color-error);
		margin: var(--space-sm) 0 0;
	}
	.hint {
		margin: var(--space-sm) 0 0;
		color: var(--color-stone);
	}
	.sr-only {
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
</style>
