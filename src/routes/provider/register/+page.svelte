<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import LegalConsentText from '$lib/components/LegalConsentText.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import { enhance } from '$app/forms';

	type FormValues = {
		displayName: string;
		email: string;
		phone: string;
		areaId: string;
	};

	let {
		data,
		form
	}: {
		data: { areas: Array<{ id: string; name: string }> };
		form?: {
			message?: string;
			issues?: Array<{ path: string; message: string }>;
			step?: 'register' | 'verify';
			otpId?: string;
			userId?: string;
			areaId?: string;
			values?: FormValues;
		};
	} = $props();

	const step = $derived(form?.step ?? 'register');
	const values = $derived(form?.values ?? { displayName: '', email: '', phone: '', areaId: '' });
	const selectedAreaName = $derived(data.areas.find((a) => a.id === values.areaId)?.name ?? '');

	let displayName = $state('');
	let email = $state('');
	let phone = $state('');
	let areaId = $state('');
	let password = $state('');
	let acceptedTerms = $state(false);
	let code = $state('');
	let resentOtpId = $state('');
	let resendMessage = $state('');

	const otpId = $derived(resentOtpId || form?.otpId || '');

	$effect(() => {
		displayName = values.displayName;
		email = values.email;
		phone = values.phone;
		areaId = values.areaId;
	});

	async function resendOtp() {
		resendMessage = '';
		const userId = form?.userId;
		if (!userId) return;
		const res = await fetch('/api/identity/otp/request', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ userId, phone: values.phone })
		});
		const json = (await res.json()) as {
			data?: { otpId: string };
			error?: { message: string };
		};
		if (res.ok && json.data?.otpId) {
			resentOtpId = json.data.otpId;
			resendMessage = 'We sent a fresh code to your mobile.';
		} else {
			resendMessage = json.error?.message ?? 'Could not resend the code. Try again shortly.';
		}
	}
</script>

<svelte:head>
	<title>Register as a provider — Peach Finder</title>
</svelte:head>

<Navigation current="profile" variant="top" />

<main class="page">
	<h1 class="display">List your massage practice</h1>
	<p class="body intro">
		Create your provider account with a verified mobile number and general service area. You will
		build your profile next.
	</p>

	{#if form?.message}
		<p class="banner label" role="status">{form.message}</p>
	{/if}

	{#if step === 'register'}
		<form class="form" method="POST" action="?/register" use:enhance>
			<Input id="displayName" name="displayName" label="Your name" bind:value={displayName} />
			<Input
				id="email"
				name="email"
				type="email"
				label="Email"
				bind:value={email}
				autocomplete="email"
			/>
			<p class="body field-hint">We will send a 6-digit code to verify this number.</p>
			<Input
				id="phone"
				name="phone"
				type="tel"
				label="Mobile number"
				bind:value={phone}
				autocomplete="tel"
			/>
			<div class="field">
				<label class="label" for="areaId">General service area</label>
				<select id="areaId" name="areaId" class="select" bind:value={areaId} required>
					<option value="">Choose an area</option>
					{#each data.areas as area (area.id)}
						<option value={area.id}>{area.name}</option>
					{/each}
				</select>
				<p class="body field-hint">
					Only your general suburb or area is ever shown publicly. Your exact address is never
					collected or stored — share precise directions yourself in messages when you choose.
				</p>
			</div>
			<Input
				id="password"
				name="password"
				type="password"
				label="Password"
				bind:value={password}
				autocomplete="new-password"
			/>
			<label class="terms">
				<input type="checkbox" name="acceptedTerms" bind:checked={acceptedTerms} required />
				<LegalConsentText />
			</label>
			{#if form?.issues}
				<ul class="issues" role="alert">
					{#each form.issues as issue (issue.path)}
						<li class="label">{issue.message}</li>
					{/each}
				</ul>
			{/if}
			<Button type="submit" variant="primary">Continue</Button>
		</form>
	{:else}
		<form class="form" method="POST" action="?/verify" use:enhance>
			<p class="body summary">
				Registering as <strong>{values.displayName}</strong>
				{#if selectedAreaName}
					in <strong>{selectedAreaName}</strong>
				{/if}
			</p>
			<p class="body verify-copy">
				Enter the 6-digit code we sent to <strong>{values.phone}</strong>. Your details stay filled
				in if you need to try again.
			</p>
			<input type="hidden" name="otpId" id="otpId" value={otpId} />
			<input type="hidden" name="userId" value={form?.userId ?? ''} />
			<input type="hidden" name="areaId" value={form?.areaId ?? values.areaId} />
			<input type="hidden" name="displayName" value={values.displayName} />
			<input type="hidden" name="email" value={values.email} />
			<input type="hidden" name="phone" value={values.phone} />
			<Input id="code" name="code" label="Verification code" bind:value={code} />
			{#if form?.issues}
				<ul class="issues" role="alert">
					{#each form.issues as issue (issue.path)}
						<li class="label">{issue.message}</li>
					{/each}
				</ul>
			{/if}
			<Button type="submit" variant="primary">Verify and continue</Button>
			<Button type="button" variant="secondary" onclick={resendOtp}>Resend code</Button>
			{#if resendMessage}
				<p class="banner label" role="status">{resendMessage}</p>
			{/if}
		</form>
	{/if}

	<p class="toggle label">
		Looking to book a therapist?
		<a class="link" href="/sign-in">Sign in as a seeker</a>
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
	.intro,
	.verify-copy,
	.summary {
		color: var(--color-stone);
		margin: 0;
	}
	.form {
		display: grid;
		gap: var(--space-md);
	}
	.field {
		display: grid;
		gap: var(--space-xs);
	}
	.select {
		min-height: 44px;
		border-radius: 14px;
		border: 1px solid var(--color-divider);
		padding: 0 var(--space-md);
		font: inherit;
		background: var(--color-paper);
		color: var(--color-ink);
	}
	.select:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
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
	.issues {
		margin: 0;
		padding-left: var(--space-md);
		color: var(--color-peach-deep);
	}
	.banner {
		margin: 0;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-cream);
		border-radius: 14px;
		color: var(--color-ink);
	}
	.toggle {
		text-align: center;
		color: var(--color-stone);
		margin: 0;
	}
	.field-hint {
		margin: calc(-1 * var(--space-sm)) 0 0;
		color: var(--color-stone);
		font-size: var(--font-label-size);
	}
	.link {
		color: var(--color-peach-deep);
	}
</style>
