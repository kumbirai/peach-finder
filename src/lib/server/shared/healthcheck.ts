/** Fire-and-forget success ping for SR-APP-10 job monitoring (healthchecks.io). */
export async function pingHealthcheck(envKey: string): Promise<void> {
	const url = process.env[envKey];
	if (!url) return;

	try {
		await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5_000) });
	} catch {
		// Monitoring must never fail the job.
	}
}
