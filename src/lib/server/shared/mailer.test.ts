import { describe, expect, it } from 'vitest';
import { smtpEmailSender, type EmailMessage, type SmtpTransport } from './mailer';

describe('SMTP email sender', () => {
	it('sends through the transport with the configured From address', async () => {
		const delivered: EmailMessage[] = [];
		const transport: SmtpTransport = {
			async sendMail(mail) {
				delivered.push({
					to: mail.to,
					subject: mail.subject,
					text: mail.text,
					html: mail.html
				});
			}
		};
		const sender = smtpEmailSender(
			{
				host: '127.0.0.1',
				port: 1025,
				secure: false,
				from: 'Peach Finder <noreply@peachfinder.local>'
			},
			transport
		);
		await sender.send({
			to: 'seeker@example.com',
			subject: 'Welcome to Peach Finder',
			text: 'Your account is ready.',
			html: '<p>Your account is ready.</p>'
		});
		expect(delivered).toEqual([
			{
				to: 'seeker@example.com',
				subject: 'Welcome to Peach Finder',
				text: 'Your account is ready.',
				html: '<p>Your account is ready.</p>'
			}
		]);
	});
});
