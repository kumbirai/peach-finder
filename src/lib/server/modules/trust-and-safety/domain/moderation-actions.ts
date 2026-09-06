export const MODERATION_ACTION_KINDS = [
	'remove_photo',
	'remove_review',
	'unpublish',
	'suspend',
	'reinstate',
	'revoke_badge'
] as const;

export type ModerationActionKind = (typeof MODERATION_ACTION_KINDS)[number];

export function auditActionForModeration(action: ModerationActionKind): string {
	switch (action) {
		case 'revoke_badge':
			return 'identity.revoke';
		default:
			return `moderation.${action}`;
	}
}
