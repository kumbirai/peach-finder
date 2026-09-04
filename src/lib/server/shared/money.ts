export interface Money {
	readonly cents: number;
	readonly currency: 'ZAR';
}

export function money(cents: number): Money {
	if (!Number.isInteger(cents)) throw new Error('Money must be integer cents');
	return { cents, currency: 'ZAR' };
}

export const addMoney = (a: Money, b: Money): Money => money(a.cents + b.cents);
