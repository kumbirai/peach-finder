<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import AdminInkStrip from '$lib/components/AdminInkStrip.svelte';
	import { enhance } from '$app/forms';

	let {
		data,
		form
	}: {
		data: { returnTo: string };
		form?:
			| {
					message?: string;
					step?: 'enroll' | 'totp';
					returnTo?: string;
					otpauthUrl?: string;
					secretBase32?: string;
					backupCodes?: string[];
			  }
			| undefined;
	} = $props();

	let step = $state<'password' | 'enroll' | 'totp'>('password');
	let returnTo = $state(data.returnTo);
	let otpauthUrl = $state<string | undefined>();
	let secretBase32 = $state<string | undefined>();
	let backupCodes = $state<string[]>([]);

	$effect(() => {
		if (form?.step === 'enroll') {
			step = 'enroll';
			returnTo = form.returnTo ?? data.returnTo;
			otpauthUrl = form.otpauthUrl;
			secretBase32 = form.secretBase32;
			backupCodes = form.backupCodes ?? [];
		} else if (form?.step === 'totp') {
			step = 'totp';
			returnTo = form.returnTo ?? data.returnTo;
		}
	});
</script>

<svelte:head>
	<title>Admin sign in — Peach Finder</title>
</svelte:head>

<AdminInkStrip />

<main class="page">
	<h1 class="display">Admin sign in</h1>
	<p class="body intro">
		Access is restricted to platform administrators. Password and TOTP are both required — no
		session is created until two-factor authentication succeeds.
	</p>

	{#if form?.message}
		<p class="error label" role="alert">{form.message}</p>
	{/if}

	{#if step === 'password'}
		<form class="form" method="POST" action="?/password" use:enhance>
			<input type="hidden" name="returnTo" value={returnTo} />
			<Input id="admin-email" label="Email" name="email" type="email" autocomplete="username" />
			<Input
				id="admin-password"
				label="Password"
				name="password"
				type="password"
				autocomplete="current-password"
			/>
			<Button type="submit" variant="primary">Continue</Button>
		</form>
	{:else if step === 'enroll'}
		<section class="panel" aria-labelledby="enroll-heading">
			<h2 id="enroll-heading" class="headline">Set up authenticator</h2>
			<p class="body">
				TOTP enrollment is mandatory before your first admin session. Scan the setup URI in your
				authenticator app, then enter the six-digit code to finish.
			</p>
			{#if otpauthUrl}
				<p class="mono label">{otpauthUrl}</p>
			{/if}
			{#if secretBase32}
				<p class="label">Manual secret: <span class="mono">{secretBase32}</span></p>
			{/if}
			{#if backupCodes.length}
				<div class="backup">
					<p class="label">Save these backup codes — shown once:</p>
					<ul>
						{#each backupCodes as code (code)}
							<li class="mono">{code}</li>
						{/each}
					</ul>
				</div>
			{/if}
			<form class="form" method="POST" action="?/totp" use:enhance>
				<input type="hidden" name="returnTo" value={returnTo} />
				<Input
					id="admin-enroll-totp"
					label="Authenticator code"
					name="totpCode"
					autocomplete="off"
				/>
				<Button type="submit" variant="primary">Enroll and sign in</Button>
			</form>
		</section>
	{:else}
		<form class="form" method="POST" action="?/totp" use:enhance>
			<input type="hidden" name="returnTo" value={returnTo} />
			<Input id="admin-totp" label="Authenticator code" name="totpCode" autocomplete="off" />
			<Input id="admin-backup" label="Or backup code" name="backupCode" autocomplete="off" />
			<Button type="submit" variant="primary">Verify and sign in</Button>
		</form>
	{/if}
</main>

<style>
	.page {
		padding: var(--space-xl) var(--space-lg);
		max-width: 40rem;
	}

	.intro {
		margin-top: var(--space-sm);
		color: var(--color-stone);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		margin-top: var(--space-lg);
	}

	.panel {
		margin-top: var(--space-lg);
	}

	.headline {
		font-family: var(--font-display-family);
		font-size: var(--font-headline-size);
		margin-bottom: var(--space-sm);
	}

	.mono {
		font-family: ui-monospace, monospace;
		word-break: break-all;
	}

	.backup {
		margin: var(--space-md) 0;
		padding: var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-paper);
		box-shadow: var(--shadow-rest);
	}

	.backup ul {
		margin: var(--space-sm) 0 0;
		padding-left: var(--space-lg);
	}

	.error {
		color: var(--color-error);
		margin-top: var(--space-md);
	}
</style>
