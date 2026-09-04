import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { publicAppOrigin } from '../env';
import { getDb } from '../db';
import { SESSION_COOKIE, findActiveSession } from '../modules/identity-and-access';
import { log } from '../shared/logger';

const wss = new WebSocketServer({ noServer: true });

function originAllowed(origin: string | undefined): boolean {
	if (!origin) return false;
	try {
		return new URL(origin).origin === new URL(publicAppOrigin()).origin;
	} catch {
		return false;
	}
}

function readCookie(header: string | undefined, name: string): string | undefined {
	if (!header) return undefined;
	const parts = header.split(';');
	for (const part of parts) {
		const [rawName, ...rest] = part.trim().split('=');
		if (rawName === name) return rest.join('=');
	}
	return undefined;
}

export async function attachWsUpgrade(
	req: IncomingMessage,
	socket: Duplex,
	head: Buffer
): Promise<void> {
	const host = req.headers.host ?? '127.0.0.1';
	const url = new URL(req.url ?? '/', `http://${host}`);
	if (url.pathname !== '/ws') {
		return;
	}

	if (!originAllowed(req.headers.origin)) {
		socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
		socket.destroy();
		return;
	}

	const token = readCookie(req.headers.cookie, SESSION_COOKIE);
	if (!token) {
		socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
		socket.destroy();
		return;
	}

	const session = await findActiveSession(getDb(), token, new Date());
	if (!session) {
		socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
		socket.destroy();
		return;
	}

	wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
		ws.send(
			JSON.stringify({
				type: 'connected',
				payload: { sessionId: session.sessionId },
				sentAt: new Date().toISOString()
			})
		);
		ws.on('error', (err) => log('warn', 'ws error', { err: err.message }));
	});
}
