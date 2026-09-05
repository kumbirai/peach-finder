import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseNativeShare, copyProfileLink, shareProfileLink } from './share-profile';

describe('share-profile', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('canUseNativeShare is false when navigator.share is missing', () => {
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
		expect(canUseNativeShare()).toBe(false);
	});

	it('canUseNativeShare is true when navigator.share exists', () => {
		vi.stubGlobal('navigator', { share: vi.fn() });
		expect(canUseNativeShare()).toBe(true);
	});

	it('copyProfileLink writes the URL to the clipboard', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });

		await copyProfileLink('https://example.com/provider/abc');

		expect(writeText).toHaveBeenCalledWith('https://example.com/provider/abc');
	});

	it('copyProfileLink falls back to execCommand when clipboard write fails', async () => {
		const writeText = vi.fn().mockRejectedValue(new Error('denied'));
		const execCommand = vi.fn(() => true);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		vi.stubGlobal('document', {
			createElement: vi.fn(() => ({
				value: '',
				style: {},
				setAttribute: vi.fn(),
				select: vi.fn()
			})),
			body: {
				appendChild: vi.fn(),
				removeChild: vi.fn()
			},
			execCommand
		});

		await copyProfileLink('https://example.com/provider/abc');

		expect(writeText).toHaveBeenCalled();
		expect(execCommand).toHaveBeenCalledWith('copy');
	});

	it('shareProfileLink uses native share when available', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { share });

		const result = await shareProfileLink('https://example.com/provider/abc', 'Amara T.');

		expect(result).toBe('shared');
		expect(share).toHaveBeenCalledWith({
			url: 'https://example.com/provider/abc',
			title: 'Amara T.'
		});
	});

	it('shareProfileLink copies when native share is unavailable', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });

		const result = await shareProfileLink('https://example.com/provider/abc', 'Amara T.');

		expect(result).toBe('copied');
		expect(writeText).toHaveBeenCalledWith('https://example.com/provider/abc');
	});
});
