import { z } from 'zod';
import { asId } from './ids';

export function zId<T extends string>() {
	return z.string().transform((raw, ctx) => {
		try {
			return asId<T>(raw);
		} catch {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid identifier.' });
			return z.NEVER;
		}
	});
}
