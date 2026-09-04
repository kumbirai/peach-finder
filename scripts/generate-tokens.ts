import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const designMd = readFileSync(path.join(root, 'DESIGN.md'), 'utf8');
const designJson = JSON.parse(readFileSync(path.join(root, '.impeccable/design.json'), 'utf8')) as {
	extensions: {
		colorMeta: Record<string, { canonical: string }>;
		shadows: Array<{ name: string; value: string }>;
		motion: Array<{ name: string; value: string }>;
		breakpoints: Array<{ name: string; value: string }>;
	};
};

const fm = designMd.match(/^---\n([\s\S]*?)\n---/);
if (!fm?.[1]) throw new Error('DESIGN.md frontmatter missing');
const tokens = parse(fm[1]) as {
	colors: Record<string, string>;
	typography: Record<
		string,
		{
			fontFamily: string;
			fontSize: string;
			fontWeight: number;
			lineHeight: number;
			letterSpacing: string;
		}
	>;
	rounded: Record<string, string>;
	spacing: Record<string, string>;
};

const extras: Record<string, string> = {
	'color-peach-deep-hover': '#9C3A1D',
	'color-error': '#A5432B',
	'color-peach-deep-pulse': 'rgba(179, 70, 37, 0.4)',
	'color-peach-deep-pulse-end': 'rgba(179, 70, 37, 0)',
	'color-focus-ring': 'rgba(179, 70, 37, 0.15)'
};

const lines: string[] = [
	'/* Generated from DESIGN.md frontmatter + .impeccable/design.json. Do not edit by hand. */',
	':root {'
];

for (const [name, value] of Object.entries(tokens.colors)) {
	lines.push(`	--color-${name}: ${value};`);
}
for (const [name, spec] of Object.entries(tokens.typography)) {
	lines.push(`	--font-${name}-family: ${spec.fontFamily};`);
	lines.push(`	--font-${name}-size: ${spec.fontSize};`);
	lines.push(`	--font-${name}-weight: ${spec.fontWeight};`);
	lines.push(`	--font-${name}-line-height: ${spec.lineHeight};`);
	lines.push(`	--font-${name}-letter-spacing: ${spec.letterSpacing};`);
}
for (const [name, value] of Object.entries(tokens.rounded)) {
	lines.push(`	--radius-${name}: ${value};`);
}
for (const [name, value] of Object.entries(tokens.spacing)) {
	lines.push(`	--space-${name}: ${value};`);
}
for (const shadow of designJson.extensions.shadows) {
	lines.push(`	--shadow-${shadow.name}: ${shadow.value};`);
}
for (const motion of designJson.extensions.motion) {
	lines.push(`	--motion-${motion.name}: ${motion.value};`);
}
for (const bp of designJson.extensions.breakpoints) {
	lines.push(`	--breakpoint-${bp.name}: ${bp.value};`);
}
for (const [name, value] of Object.entries(extras)) {
	lines.push(`	--${name}: ${value};`);
}
lines.push('}');
lines.push('');

const outDir = path.join(root, 'src/lib/styles');
mkdirSync(outDir, { recursive: true });
const cssPath = path.join(outDir, 'tokens.css');
writeFileSync(cssPath, `${lines.join('\n')}\n`);

const jsonOut = {
	colors: tokens.colors,
	extras,
	canonicalFromJson: Object.fromEntries(
		Object.entries(designJson.extensions.colorMeta).map(([k, v]) => [k, v.canonical])
	)
};
writeFileSync(
	path.join(outDir, 'tokens.generated.json'),
	`${JSON.stringify(jsonOut, null, '\t')}\n`
);
console.info(`wrote ${cssPath}`);
