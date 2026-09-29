import {
	beforeDiscount,
	birthdayDiscount,
	birthdayQualifies,
} from '@cart-agent/contracts'
import { resolveWhen, workingDaysUntil } from './dates'
import { amountsIn, inventedAmounts, offStyle } from './money-guard'
import { applyChanges, fillWithinBudget } from './proposal'

describe('workingDaysUntil', () => {
	// 2026-09-26 is a Saturday.
	it('counts only weekdays after today, up to and including the date', () => {
		expect(workingDaysUntil('2026-09-26', '2026-09-28')).toBe(1) // Monday
		expect(workingDaysUntil('2026-09-26', '2026-10-02')).toBe(5) // Friday
		expect(workingDaysUntil('2026-09-26', '2026-10-03')).toBe(5) // Saturday
	})
	it('gives 0 for today or a date in the past', () => {
		expect(workingDaysUntil('2026-09-26', '2026-09-26')).toBe(0)
		expect(workingDaysUntil('2026-09-26', '2026-09-20')).toBe(0)
	})
})

describe('fillWithinBudget', () => {
	const ranked = [
		{ slug: 'telescope', priceCents: 11900 },
		{ slug: 'atlas', priceCents: 2200 },
		{ slug: 'robot', priceCents: 2900 },
		{ slug: 'kite', priceCents: 2600 },
	]
	it('skips a pick that does not fit instead of stopping', () => {
		expect(fillWithinBudget(ranked, 6000, 2)).toEqual([
			{ slug: 'atlas', quantity: 1 },
			{ slug: 'robot', quantity: 1 },
		])
	})
	it('never exceeds the budget', () => {
		const lines = fillWithinBudget(ranked, 5000, 3)
		const total = lines.reduce(
			(s, l) => s + ranked.find((r) => r.slug === l.slug)!.priceCents,
			0,
		)
		expect(total).toBeLessThanOrEqual(5000)
	})
	it('returns nothing when even the cheapest does not fit', () => {
		expect(fillWithinBudget(ranked, 1000, 1)).toEqual([])
	})
})

describe('applyChanges', () => {
	const lines = [
		{ slug: 'atlas', quantity: 1 },
		{ slug: 'robot', quantity: 1 },
	]
	it('sets a quantity, drops at 0, brings in an alternative', () => {
		expect(
			applyChanges(lines, [
				{ slug: 'atlas', quantity: 3 },
				{ slug: 'robot', quantity: 0 },
				{ slug: 'kite', quantity: 1 },
			]),
		).toEqual([
			{ slug: 'atlas', quantity: 3 },
			{ slug: 'kite', quantity: 1 },
		])
	})
})

describe('money guard', () => {
	it('reads dollar amounts in their usual spellings', () => {
		expect(amountsIn('It is $22, with $38.00 left, $1,200.5 total')).toEqual([
			2200, 3800, 120050,
		])
	})
	it('flags an amount that was not in the facts', () => {
		expect(inventedAmounts('Only $19.99 today', [2200, 3800])).toEqual([1999])
		expect(inventedAmounts('It is $22.00', [2200])).toEqual([])
	})
})

describe('resolveWhen', () => {
	const none = { weekday: null, date: null, inDays: null }
	// Said on Saturday 2026-09-26.
	it('takes the nearest such weekday after today', () => {
		expect(resolveWhen('2026-09-26', { ...none, weekday: 'monday' })).toBe(
			'2026-09-28',
		)
		expect(resolveWhen('2026-09-26', { ...none, weekday: 'friday' })).toBe(
			'2026-10-02',
		)
	})
	it('means next week when the weekday is today', () => {
		expect(resolveWhen('2026-09-26', { ...none, weekday: 'saturday' })).toBe(
			'2026-10-03',
		)
	})
	it('keeps an explicit date and counts plain days', () => {
		expect(resolveWhen('2026-09-26', { ...none, date: '2026-10-10' })).toBe(
			'2026-10-10',
		)
		expect(resolveWhen('2026-09-26', { ...none, inDays: 7 })).toBe('2026-10-03')
	})
	it('gives null when nothing usable was said', () => {
		expect(resolveWhen('2026-09-26', none)).toBeNull()
	})
})

describe('style guard', () => {
	it('catches the phrases the composer is told not to use', () => {
		expect(offStyle('It is wonderful that you are here.', '')).not.toBeNull()
		expect(offStyle('Great choice!', '')).not.toBeNull()
		expect(offStyle('It fits perfectly.', '')).not.toBeNull()
		expect(offStyle('I would suggest the atlas.', '')).toBeNull()
	})
	it('lets a word through when it is part of the facts', () => {
		expect(
			offStyle(
				'The Letterpress Birthday Card is not included.',
				'Letterpress Birthday Card',
			),
		).toBeNull()
	})
})

describe('birthday discount', () => {
	// Saturday: Friday is 5 working days away, the next Monday 6.
	const today = '2026-09-26'

	it('applies within 5 working days of the birthday', () => {
		expect(birthdayQualifies(today, '2026-10-02')).toBe(true)
		expect(birthdayQualifies(today, '2026-10-05')).toBe(false)
		expect(birthdayQualifies(today, '2026-09-25')).toBe(false)
		expect(birthdayQualifies(today, null)).toBe(false)
	})

	it('takes 20% off the subtotal', () => {
		expect(birthdayDiscount(7399, today, '2026-10-02')?.amountCents).toBe(1480)
		expect(birthdayDiscount(7399, today, '2026-10-05')).toBeNull()
	})

	it('never lets a basket at the pre-discount cap cost more than the budget', () => {
		for (const budget of [1200, 4500, 7000, 7001, 7003, 9999]) {
			const cap = beforeDiscount(budget, 20)
			for (const subtotal of [cap, cap - 1, cap - 2]) {
				const off = birthdayDiscount(subtotal, today, '2026-10-02')!
				expect(subtotal - off.amountCents).toBeLessThanOrEqual(budget)
			}
		}
	})
})
