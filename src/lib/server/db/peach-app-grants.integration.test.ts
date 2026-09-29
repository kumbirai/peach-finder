import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { withTestDatabase } from './test-harness';
import { newId } from '../shared/ids';

describe('peach_app database grants', () => {
	it('allows peach_app to write direct_messaging.thread rows', async () => {
		await withTestDatabase(async () => {
			const appUrl = new URL(process.env.DATABASE_URL ?? '');
			appUrl.username = 'peach_app';
			appUrl.password = 'secret';
			const appSql = postgres(appUrl.toString(), { max: 1 });
			const threadId = newId<'ThreadId'>();
			const seekerId = newId<'UserId'>();
			const profileId = newId<'ProviderProfileId'>();
			try {
				await appSql`
					INSERT INTO identity_and_access."user" (id, display_name, email, status)
					VALUES (${seekerId}, 'Grant seeker', 'grant-seeker@example.com', 'active')
					ON CONFLICT DO NOTHING
				`;
				await appSql`
					INSERT INTO provider_profile.provider_profile (id, owner_id, publish_state)
					VALUES (${profileId}, ${seekerId}, 'published')
					ON CONFLICT DO NOTHING
				`;
				await appSql`
					INSERT INTO direct_messaging.thread (id, seeker_id, provider_profile_id, created_at, last_activity_at)
					VALUES (${threadId}, ${seekerId}, ${profileId}, now(), now())
					ON CONFLICT DO NOTHING
				`;
				const rows = await appSql`
					SELECT id FROM direct_messaging.thread WHERE id = ${threadId}
				`;
				expect(rows).toHaveLength(1);
			} finally {
				await appSql.end();
			}
		});
	});
});
