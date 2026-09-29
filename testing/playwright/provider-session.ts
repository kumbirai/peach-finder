import { expect, type APIRequestContext, type Page } from '@playwright/test';
import sharp from 'sharp';

function svelteKitActionIds(body: string): { otpId: string; userId: string } {
	try {
		const parsed = JSON.parse(body) as { data?: string };
		if (!parsed.data) return { otpId: '', userId: '' };
		const decoded = JSON.parse(parsed.data) as unknown[];
		return {
			otpId: typeof decoded[2] === 'string' ? decoded[2] : '',
			userId: typeof decoded[3] === 'string' ? decoded[3] : ''
		};
	} catch {
		return { otpId: '', userId: '' };
	}
}

export async function selectRegistrationArea(page: Page): Promise<string> {
	const areaId = await page.locator('#areaId option').nth(1).getAttribute('value');
	expect(areaId, 'registration requires a seeded area').toBeTruthy();
	await page.locator('#areaId').selectOption(areaId!);
	await expect(page.locator('#areaId')).toHaveValue(areaId!);
	return areaId!;
}

async function fillBoundField(page: Page, label: string, value: string): Promise<void> {
	const field = page.getByLabel(label);
	await field.click();
	await field.fill(value);
	await field.dispatchEvent('input');
	await field.dispatchEvent('change');
}

export async function submitProviderRegistrationForm(
	page: Page,
	input: { name: string; email: string; phone: string; password: string }
): Promise<void> {
	await page.goto('/provider/register');
	await fillBoundField(page, 'Your name', input.name);
	await fillBoundField(page, 'Email', input.email);
	await fillBoundField(page, 'Mobile number', input.phone);
	await selectRegistrationArea(page);
	await fillBoundField(page, 'Password', input.password);
	await page.locator('input[name="acceptedTerms"]').check();
	await Promise.all([
		page.waitForResponse(
			(res) => res.url().includes('/provider/register') && res.request().method() === 'POST'
		),
		page.getByRole('button', { name: 'Continue' }).click()
	]);
	await expect(page.getByLabel('Verification code')).toBeVisible({ timeout: 20_000 });
}

function hiddenInputValue(html: string, name: string): string {
	const named = new RegExp(
		`name="${name}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${name}"`
	).exec(html);
	return named?.[1] ?? named?.[2] ?? '';
}

export async function registerVerifiedProvider(
	page: Page,
	request: APIRequestContext,
	input: { name: string; email: string; phone: string; password: string }
): Promise<string> {
	await page.goto('/provider/register');
	const areaId = await selectRegistrationArea(page);

	const registerRes = await page.request.post('/provider/register?/register', {
		headers: { Accept: 'text/html' },
		form: {
			displayName: input.name,
			email: input.email,
			phone: input.phone,
			areaId: areaId!,
			password: input.password,
			acceptedTerms: 'on'
		},
		maxRedirects: 0
	});
	const registerHtml = await registerRes.text();
	expect(registerRes.status(), registerHtml.slice(0, 500)).toBe(200);

	const actionIds = svelteKitActionIds(registerHtml);
	const otpId = hiddenInputValue(registerHtml, 'otpId') || actionIds.otpId;
	const userId = hiddenInputValue(registerHtml, 'userId') || actionIds.userId;
	expect(otpId, registerHtml.slice(0, 800)).toBeTruthy();
	expect(userId, registerHtml.slice(0, 800)).toBeTruthy();

	const otpRes = await request.post('/api/dev/otp-code', { data: { otpId } });
	expect(otpRes.ok(), await otpRes.text()).toBeTruthy();
	const { data } = (await otpRes.json()) as { data: { code: string } };

	const verifyRes = await page.request.post('/provider/register?/verify', {
		form: {
			otpId,
			userId,
			areaId: areaId!,
			displayName: input.name,
			email: input.email,
			phone: input.phone,
			code: data.code
		},
		maxRedirects: 0
	});
	const verifyBody = await verifyRes.text();
	const redirected =
		verifyRes.status() === 303 ||
		(verifyRes.status() === 200 && /"type":"redirect"/.test(verifyBody) && /onboarding/.test(verifyBody));
	expect(redirected, verifyBody).toBe(true);

	await page.goto('/provider/onboarding');
	await expect(page).toHaveURL(/\/provider\/onboarding/, { timeout: 15_000 });
	return areaId!;
}

export async function publishOnboardedListing(page: Page, areaId: string): Promise<void> {
	const stamp = Date.now();
	const buffer = await sharp({
		create: {
			width: 64 + (stamp % 20),
			height: 64 + (stamp % 17),
			channels: 3,
			background: { r: stamp % 200, g: (stamp >> 3) % 200, b: (stamp >> 5) % 200 }
		}
	})
		.jpeg()
		.toBuffer();
	const uploadRes = await page.request.post('/api/media/uploads', {
		multipart: {
			file: { name: 'profile.jpg', mimeType: 'image/jpeg', buffer },
			scope: 'profile_photo'
		}
	});
	expect(uploadRes.ok(), await uploadRes.text()).toBeTruthy();
	const uploadBody = (await uploadRes.json()) as { data: { photoId: string } };
	const attachRes = await page.request.post('/api/provider/profile/photos', {
		data: { photoId: uploadBody.data.photoId }
	});
	expect(attachRes.ok(), await attachRes.text()).toBeTruthy();

	for (const [action, form] of [
		['saveIntro', { intro: 'Sports recovery specialist walking the reuse path.' }],
		['saveService', { name: 'Deep tissue', durationMinutes: '60', priceRands: '450' }],
		['saveLanguages', { codes: 'en' }],
		['saveArea', { areaId }],
		['publish', {}]
	] as const) {
		const response = await page.request.post(`/provider/onboarding?/${action}`, {
			form,
			maxRedirects: 0
		});
		expect([200, 303], `${action} ${response.status()}`).toContain(response.status());
	}

	await page.goto('/provider/dashboard');
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
}

export async function registerAndPublishProvider(
	page: Page,
	request: APIRequestContext,
	input: { name: string; email: string; phone: string; password: string }
): Promise<void> {
	const areaId = await registerVerifiedProvider(page, request, input);
	await publishOnboardedListing(page, areaId);
}
