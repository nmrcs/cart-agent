import { z } from 'zod'

// The shop's one discount, as data. The backend applies it to quotes and
// carts; the harness and the storefront only show it. Nothing the buyer or
// the model says can change the percent or the rule.
export const BIRTHDAY_DISCOUNT = {
	label: 'Birthday discount',
	percent: 20,
	// Counted like delivery: the working days after today up to the birthday.
	withinWorkingDays: 5,
} as const

export const Discount = z.object({
	label: z.string(),
	percent: z.number().int(),
	amountCents: z.number().int().nonnegative(),
})
export type Discount = z.infer<typeof Discount>

// Shown in the chat as its own card once the birthday qualifies.
export const Promotion = z.object({
	label: z.string(),
	percent: z.number().int(),
	withinWorkingDays: z.number().int(),
	birthdayOn: z.string(),
	budgetCents: z.number().int().nullable(),
	// What the budget buys before the discount is taken off.
	coversCents: z.number().int().nullable(),
})
export type Promotion = z.infer<typeof Promotion>

export function workingDaysUntil(today: string, date: string): number {
	const start = Date.parse(`${today}T00:00:00Z`)
	const end = Date.parse(`${date}T00:00:00Z`)
	let days = 0
	for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
		const weekday = new Date(t).getUTCDay()
		if (weekday !== 0 && weekday !== 6) days++
	}
	return days
}

export function localToday(): string {
	const d = new Date()
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function birthdayQualifies(
	today: string,
	birthdayOn: string | null | undefined,
): boolean {
	if (!birthdayOn || birthdayOn < today) return false
	return (
		workingDaysUntil(today, birthdayOn) <= BIRTHDAY_DISCOUNT.withinWorkingDays
	)
}

// The discount on a subtotal, or null when the birthday does not qualify.
export function birthdayDiscount(
	subtotalCents: number,
	today: string,
	birthdayOn: string | null | undefined,
): Discount | null {
	if (!birthdayQualifies(today, birthdayOn) || subtotalCents === 0) return null
	return {
		label: BIRTHDAY_DISCOUNT.label,
		percent: BIRTHDAY_DISCOUNT.percent,
		amountCents: Math.round((subtotalCents * BIRTHDAY_DISCOUNT.percent) / 100),
	}
}

// The most a basket may cost before the discount and still cost no more than
// `budgetCents` after it.
export function beforeDiscount(budgetCents: number, percent: number): number {
	return Math.floor((budgetCents * 100) / (100 - percent))
}
