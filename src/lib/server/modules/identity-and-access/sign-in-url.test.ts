import { describe, expect, it } from 'vitest';
import { buildSignInUrl, gatedActionHref } from './app/sign-in-url';
import { parseGatedAction } from './domain/sign-in-intent';

describe('sign-in-url', () => {
	it('builds a sign-in URL with return context', () => {
		const url = buildSignInUrl({
			returnTo: '/provider/01900000-0000-7000-8000-000000000101',
			action: 'message',
			providerProfileId: '01900000-0000-7000-8000-000000000101'
		});
		expect(url).toContain('/sign-in?');
		expect(url).toContain('returnTo=%2Fprovider%2F');
		expect(url).toContain('action=message');
	});

	it('gatedActionHref encodes profile path', () => {
		const href = gatedActionHref('review', '/provider/abc', 'abc', 'https://example.com');
		expect(href).toBe(
			'https://example.com/sign-in?returnTo=%2Fprovider%2Fabc&action=review&providerProfileId=abc'
		);
	});

	it('gatedActionHref supports block action', () => {
		const href = gatedActionHref('block', '/provider/abc', 'abc');
		expect(href).toContain('action=block');
	});

	it('parseGatedAction rejects unknown actions', () => {
		expect(parseGatedAction('message')).toBe('message');
		expect(parseGatedAction('block')).toBe('block');
		expect(parseGatedAction('hack')).toBeNull();
	});
});
