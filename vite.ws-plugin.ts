import type { Plugin } from 'vite';
import { attachWsUpgrade } from './src/lib/server/ws/attach';

export function wsUpgradePlugin(): Plugin {
	return {
		name: 'peach-ws-upgrade',
		configureServer(server) {
			server.httpServer?.on('upgrade', (req, socket, head) => {
				void attachWsUpgrade(req, socket, head);
			});
		}
	};
}
