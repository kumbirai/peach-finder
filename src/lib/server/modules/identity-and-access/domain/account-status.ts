export type AccountStatusKind = 'active' | 'suspended' | 'deleted';

export type AccountStatusTransition =
	| { from: 'active' | 'suspended'; to: 'deleted'; trigger: 'self_delete' }
	| { from: 'active'; to: 'suspended'; trigger: 'admin_suspend' }
	| { from: 'suspended'; to: 'active'; trigger: 'admin_reinstate' };

export class IllegalAccountTransitionError extends Error {
	constructor(
		readonly from: AccountStatusKind,
		readonly to: AccountStatusKind
	) {
		super(`illegal account transition: ${from} → ${to}`);
		this.name = 'IllegalAccountTransitionError';
	}
}

export function assertCanSelfDelete(status: AccountStatusKind): void {
	if (status !== 'active' && status !== 'suspended') {
		throw new IllegalAccountTransitionError(status, 'deleted');
	}
}
