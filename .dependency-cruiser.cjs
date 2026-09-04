/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: 'domain-no-framework',
			comment: 'domain/ imports nothing except shared-kernel types',
			severity: 'error',
			from: { path: '^src/lib/server/modules/[^/]+/domain' },
			to: {
				path: '(app|infra|sveltekit|drizzle-orm|postgres|pg-boss|\\$app)'
			}
		},
		{
			name: 'app-no-infra',
			comment: 'application layer defines ports; it must not import infra',
			severity: 'error',
			from: { path: '^src/lib/server/modules/[^/]+/app' },
			to: { path: '^src/lib/server/modules/[^/]+/infra' }
		},
		{
			name: 'no-module-internals',
			comment: 'other modules may import only index.ts of a bounded context',
			severity: 'error',
			from: {
				path: '^src/lib/server/modules/([^/]+)/.+',
				pathNot: '\\.(integration\\.)?test\\.ts$'
			},
			to: {
				path: '^src/lib/server/modules/([^/]+)/(domain|app|infra)/',
				pathNot: '^src/lib/server/modules/$1/'
			}
		},
		{
			name: 'rate-limit-isolation',
			comment: 'SR-SEC-11: rate-limit has no path into trust-and-safety or provider-profile',
			severity: 'error',
			from: { path: '^src/lib/server/shared/rate-limit' },
			to: { path: 'modules/(trust-and-safety|provider-profile)' }
		},
		{
			name: 'routes-no-sql',
			comment: 'delivery layer must not import drizzle schemas or sql',
			severity: 'error',
			from: { path: '^src/routes' },
			to: { path: '(infra/schema|drizzle-orm)' }
		}
	],
	options: {
		doNotFollow: { path: 'node_modules' },
		tsPreCompilationDeps: true,
		tsConfig: { fileName: 'tsconfig.json' },
		enhancedResolveOptions: {
			exportsFields: ['exports'],
			conditionNames: ['import', 'require', 'node', 'default']
		}
	}
};
