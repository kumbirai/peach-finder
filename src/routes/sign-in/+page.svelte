<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import LegalConsentText from '$lib/components/LegalConsentText.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import { enhance } from '$app/forms';

	let {
		data,
		form
	}: {
		data: {
			returnTo: string;
			action: string | null;
			providerProfileId: string | null;
			messageDraft: string;
			initialMode: 'sign-in' | 'sign-up';
		};
		form?: { message?: string; issues?: Array<{ path: string; message: string }> };
	} = $props();

	let modeOverride = $state<'sign-in' | 'sign-up' | null>(null);
	const mode = $derived(modeOverride ?? data.initialMode);
	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let acceptedTerms = $state(false);

	const actionLabel = $derived(
		data.action === 'message'
			? 'send a message'
			: data.action === 'review'
				? 'leave a review'
				: data.action === 'report'
					? 'report this profile'
					: data.action === 'block'
						? 'block this person'
						: 'continue'
	);

	const oauthQuery = $derived.by(() => {
		const parts = [`returnTo=${encodeURIComponent(data.returnTo)}`];
		if (data.action) parts.push(`action=${encodeURIComponent(data.action)}`);
		if (data.providerProfileId) {
			parts.push(`providerProfileId=${encodeURIComponent(data.providerProfileId)}`);
		}
		if (data.messageDraft) {
			parts.push(`draft=${encodeURIComponent(data.messageDraft)}`);
		}
		return parts.join('&');
	});
</script>

<svelte:head>
	<title>{mode === 'sign-up' ? 'Create account' : 'Sign in'} — Peach Finder</title>
</svelte:head>

<Navigation current="profile" variant="top" />

<main class="page">
	<h1 class="display">{mode === 'sign-up' ? 'Create your account' : 'Welcome back'}</h1>
	{#if data.action}
		<p class="body intro">
			One step to {actionLabel} — you will return right where you left off.
		</p>
	{/if}

	<div class="oauth">
		<Button href="/api/identity/oauth/google/start?{oauthQuery}" variant="secondary">
			Continue with Google
		</Button>
	</div>

	<p class="divider label" aria-hidden="true">or use email</p>

	{#if form?.message}
		<p class="error label" role="alert">{form.message}</p>
	{/if}
	{#if form?.issues}
		<ul class="issues" role="alert">
			{#each form.issues as issue (issue.path)}
				<li class="label">{issue.message}</li>
			{/each}
		</ul>
	{/if}

	<form
		class="form"
		method="POST"
		action="?/{mode === 'sign-up' ? 'register' : 'login'}"
		use:enhance
	>
		{#if mode === 'sign-up'}
			<Input id="displayName" name="displayName" label="Your name" bind:value={displayName} />
		{/if}
		<Input id="email" name="email" type="email" label="Email" bind:value={email} />
		<Input
			id="password"
			name="password"
			type="password"
			label="Password"
			bind:value={password}
			autocomplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
		/>
		{#if mode === 'sign-up'}
			<label class="terms">
				<input type="checkbox" name="acceptedTerms" bind:checked={acceptedTerms} required />
				<LegalConsentText />
			</label>
		{/if}
		<input type="hidden" name="returnTo" value={data.returnTo} />
		{#if data.action}
			<input type="hidden" name="action" value={data.action} />
		{/if}
		{#if data.providerProfileId}
			<input type="hidden" name="providerProfileId" value={data.providerProfileId} />
		{/if}
		<input type="hidden" name="messageDraft" value={data.messageDraft} />
		<Button type="submit" variant="primary">
			{mode === 'sign-up' ? 'Create account' : 'Sign in'}
		</Button>
	</form>

	{#if mode === 'sign-in'}
		<p class="toggle label">
			<a class="link" href="/forgot-password">Forgot password?</a>
		</p>
	{/if}

	<p class="toggle label">
		{#if mode === 'sign-up'}
			Already have an account?
			<button type="button" class="link" onclick={() => (modeOverride = 'sign-in')}>Sign in</button>
		{:else}
			New here?
			<button type="button" class="link" onclick={() => (modeOverride = 'sign-up')}
				>Create account</button
			>
		{/if}
	</p>
</main>

<style>
	.page {
		max-width: 28rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-lg);
	}
	.intro {
		color: var(--color-stone);
		margin: 0;
	}
	.oauth {
		display: grid;
	}
	.divider {
		text-align: center;
		color: var(--color-stone);
		margin: 0;
	}
	.form {
		display: grid;
		gap: var(--space-md);
	}
	.terms {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		min-height: 44px;
		cursor: pointer;
	}
	.terms input {
		margin-top: 4px;
		min-width: 20px;
		min-height: 20px;
		accent-color: var(--color-peach-deep);
	}
	.error {
		color: var(--color-peach-deep);
		margin: 0;
	}
	.issues {
		margin: 0;
		padding-left: var(--space-md);
		color: var(--color-peach-deep);
	}
	.toggle {
		text-align: center;
		color: var(--color-stone);
		margin: 0;
	}
	.link {
		background: none;
		border: none;
		color: var(--color-peach-deep);
		font: inherit;
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
		min-height: 44px;
	}
	a.link {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}
	a.link:hover {
		text-decoration: underline;
	}
	.link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
</style>
