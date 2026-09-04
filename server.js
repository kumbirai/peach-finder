import { createServer } from 'node:http';
import { handler } from './build/handler.js';
import { attachWsUpgrade } from './src/lib/server/ws/attach.ts';

const port = Number(process.env.PORT ?? 3000);
const server = createServer((req, res) => {
	void handler(req, res);
});

server.on('upgrade', (req, socket, head) => {
	void attachWsUpgrade(req, socket, head);
});

server.listen(port, () => {
	console.info(`peach-finder listening on ${port}`);
});
