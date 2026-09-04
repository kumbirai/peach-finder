import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		typescript: {
			config: (config) => {
				config.include.push('../drizzle.config.ts');
				config.include.push('../scripts/**/*.ts');
				config.include.push('../src/worker/**/*.ts');
			}
		}
	}
};

export default config;
