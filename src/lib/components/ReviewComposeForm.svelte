<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { untrack } from 'svelte';

	let {
		busy = false,
		initialRating = null,
		initialBody = '',
		submitLabel = 'Publish review',
		busyLabel = 'Publishing…',
		onSubmit
	}: {
		busy?: boolean;
		initialRating?: number | null;
		initialBody?: string;
		submitLabel?: string;
		busyLabel?: string;
		onSubmit: (input: { rating: number; body?: string }) => Promise<void>;
	} = $props();

	let rating = $state<number | null>(untrack(() => initialRating));
	let body = $state(untrack(() => initialBody));
	let errorMessage = $state('');

	const stars = [1, 2, 3, 4, 5];

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';
		const form = event.currentTarget as HTMLFormElement;
		const checkedInput = form.querySelector<HTMLInputElement>('input[name="rating"]:checked');
		const formRating = checkedInput ? Number(checkedInput.value) : NaN;
		const resolvedRating =
			Number.isInteger(formRating) && formRating >= 1 && formRating <= 5 ? formRating : rating;
		if (resolvedRating == null || resolvedRating < 1 || resolvedRating > 5) {
			errorMessage = 'Choose a rating from 1 to 5 stars.';
			return;
		}
		await onSubmit({
			rating: resolvedRating,
			...(body.trim() ? { body: body.trim() } : {})
		});
	}
</script>

<form class="review-form" onsubmit={handleSubmit} data-testid="review-compose-form">
	<fieldset class="rating-field">
		<legend class="label">Your rating</legend>
		<div class="stars">
			{#each stars as value (value)}
				<label class="star-label">
					<input
						type="radio"
						name="rating"
						{value}
						checked={rating === value}
						disabled={busy}
						class="star-input"
						onchange={() => {
							rating = value;
						}}
					/>
					<span class="star-display" aria-hidden="true">
						{value <= (rating ?? 0) ? '★' : '☆'}
					</span>
					<span class="visually-hidden">{value} star{value === 1 ? '' : 's'}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<label class="label" for="reviewBody">Your experience (optional)</label>
	<textarea
		id="reviewBody"
		name="body"
		class="body-input"
		rows="5"
		maxlength="1000"
		placeholder="Share what stood out — keep it helpful for the next person."
		bind:value={body}
		disabled={busy}></textarea>

	{#if errorMessage}
		<p class="error label" role="alert">{errorMessage}</p>
	{/if}

	<Button type="submit" variant="primary" disabled={busy}>
		{busy ? busyLabel : submitLabel}
	</Button>
</form>

<style>
	.review-form {
		display: grid;
		gap: var(--space-md);
	}
	.rating-field {
		border: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-sm);
	}
	.rating-field legend {
		font-weight: 600;
	}
	.stars {
		display: flex;
		gap: var(--space-xs);
	}
	.star-label {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-pill);
		background: var(--color-blush);
		color: var(--color-peach-deep);
		font-size: 1.25rem;
		cursor: pointer;
	}
	.star-input {
		position: absolute;
		opacity: 0;
		width: 44px;
		height: 44px;
		margin: 0;
		cursor: pointer;
	}
	.star-input:focus-visible + .star-display {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}
	.star-input:checked + .star-display,
	.star-label:has(.star-input:checked) {
		background: var(--color-peach-deep);
		color: var(--color-paper);
	}
	.star-label:has(.star-input:checked) .star-display {
		color: var(--color-paper);
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
	.body-input {
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: 16px var(--space-md);
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		min-height: 120px;
		resize: vertical;
	}
	.body-input:focus {
		border: 2px solid var(--color-peach-deep);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.error {
		margin: 0;
		color: var(--color-peach-deep);
	}
</style>
