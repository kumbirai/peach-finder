import type { UserId } from '../../shared/ids';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}

/** Wave 0: no profiles exist yet. Wave 1 implements the real lookup. */
export async function ownsProfile(_userId: UserId): Promise<boolean> {
	return false;
}
