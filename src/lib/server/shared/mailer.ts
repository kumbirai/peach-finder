import nodemailer from 'nodemailer';
import { log } from './logger';
import { parseSmtpSettings, type SmtpSettings } from './smtp-settings';

export type EmailMessage = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

export type EmailSender = {
	send: (message: EmailMessage) => Promise<void>;
};

export type SmtpTransport = {
	sendMail: (mail: {
		from: string;
		to: string;
		subject: string;
		text: string;
		html?: string;
	}) => Promise<unknown>;
};

export function noopEmailSender(): EmailSender {
	return {
		async send() {
			/* CI / unit tests without SMTP_HOST */
		}
	};
}

export function smtpEmailSender(settings: SmtpSettings, transport: SmtpTransport): EmailSender {
	return {
		async send(message) {
			await transport.sendMail({
				from: settings.from,
				to: message.to,
				subject: message.subject,
				text: message.text,
				html: message.html
			});
		}
	};
}

export function nodemailerTransport(settings: SmtpSettings): SmtpTransport {
	return nodemailer.createTransport({
		host: settings.host,
		port: settings.port,
		secure: settings.secure,
		auth: settings.user && settings.pass ? { user: settings.user, pass: settings.pass } : undefined
	});
}

let testOverride: EmailSender | null = null;

export function setEmailSenderForTests(sender: EmailSender | null): void {
	testOverride = sender;
}

export function resolveEmailSender(env: NodeJS.Dict<string> = process.env): EmailSender {
	if (testOverride) return testOverride;
	const settings = parseSmtpSettings(env);
	if (!settings) return noopEmailSender();
	return smtpEmailSender(settings, nodemailerTransport(settings));
}

export async function sendTransactionalEmail(message: EmailMessage): Promise<void> {
	try {
		await resolveEmailSender().send(message);
	} catch (error) {
		log('error', 'transactional email send failed', {
			toHost: message.to.split('@')[1] ?? 'unknown'
		});
		throw error;
	}
}

export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function notificationEmailHtml(body: string, actionUrl: string): string {
	return `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(actionUrl)}">Open in Peach Finder</a></p>`;
}
