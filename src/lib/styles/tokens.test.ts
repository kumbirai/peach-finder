import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');

describe('token pipeline', () => {
	it('matches DESIGN.md / design.json canonical colors', () => {
		const generated = JSON.parse(
			readFileSync(path.join(root, 'src/lib/styles/tokens.generated.json'), 'utf8')
		) as {
			colors: Record<string, string>;
			canonicalFromJson: Record<string, string>;
		};
		expect(generated.colors['peach-deep']).toBe('#B34625');
		expect(generated.canonicalFromJson['peach-deep']).toBe('#B34625');
		expect(generated.colors.cream).toBe('#FBF7F2');
	});

	it('keeps hex values out of component sources', () => {
		const files = [
			'Button.svelte',
			'Chip.svelte',
			'Card.svelte',
			'Input.svelte',
			'AvailabilityPill.svelte',
			'Badge.svelte',
			'Navigation.svelte',
			'AdminInkStrip.svelte',
			'Skeleton.svelte'
		];
		const hex = /#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})(?![0-9A-Fa-f])/;
		for (const file of files) {
			const source = readFileSync(path.join(root, 'src/lib/components', file), 'utf8');
			const style = source.split('<style>')[1]?.split('</style>')[0] ?? source;
			expect(style, file).not.toMatch(hex);
		}
	});

	it('disables the availability pulse under reduced motion', () => {
		const source = readFileSync(
			path.join(root, 'src/lib/components/AvailabilityPill.svelte'),
			'utf8'
		);
		expect(source).toContain('prefers-reduced-motion: reduce');
		expect(source).toContain('animation: none');
	});
});
