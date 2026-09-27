export function mailhogUrl(): string {
	return (process.env.MAILHOG_URL ?? 'http://127.0.0.1:8025').replace(/\/$/, '');
}

type MailhogMessage = {
	Content?: {
		Headers?: Record<string, string[]>;
		Body?: string;
	};
};

export async function mailhogIsReachable(): Promise<boolean> {
	try {
		const response = await fetch(`${mailhogUrl()}/api/v2/messages?limit=1`, {
			signal: AbortSignal.timeout(2000)
		});
		return response.ok;
	} catch {
		return false;
	}
}

export async function waitForMailhogMessage(input: {
	to: string;
	subjectIncludes: string;
	timeoutMs?: number;
}): Promise<MailhogMessage> {
	const deadline = Date.now() + (input.timeoutMs ?? 20_000);
	const needle = input.to.toLowerCase();
	while (Date.now() < deadline) {
		const response = await fetch(`${mailhogUrl()}/api/v2/messages?limit=50`);
		if (response.ok) {
			const body = (await response.json()) as { items?: MailhogMessage[] };
			const match = (body.items ?? []).find((item) => {
				const headers = item.Content?.Headers ?? {};
				const to = (headers.To ?? []).join(' ').toLowerCase();
				const subject = (headers.Subject ?? []).join(' ');
				return to.includes(needle) && subject.includes(input.subjectIncludes);
			});
			if (match) return match;
		}
		await new Promise((resolve) => setTimeout(resolve, 400));
	}
	throw new Error(
		`MailHog did not receive mail to ${input.to} with subject containing "${input.subjectIncludes}"`
	);
}
