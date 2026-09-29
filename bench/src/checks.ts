import type { Line } from './agent'
import { type Catalog, workingDaysUntil } from './catalog'
import { type Move, type Persona, TODAY } from './personas'

// Everything here is judged against the catalog and the persona's hidden
// profile. What the agent says about prices or totals is never trusted.

export type Violations = {
	unknown: string[]
	outOfStock: string[]
	wrongAge: string[]
	late: string[]
	owned: string[]
	overBudget: boolean
	// Lines that appeared without the buyer asking for more.
	unasked: string[]
}

export type TextChecks = {
	// Dollar amounts that are no price, line total, total, budget or
	// remainder the conversation has seen.
	invented: number[]
	// A stated total or remainder that is neither the true one nor the one
	// before this turn's change.
	wrongTotal: number | null
	wrongRemainder: number | null
	// Says something went into the cart on a turn when nothing did.
	falseCartClaim: boolean
	// Offers to add more when the buyer did not ask for more.
	offeredMore: boolean
}

// What the buyer pays: the shop's birthday rule takes 20% off when the
// persona's birthday falls in its window.
export function payable(totalCents: number, persona: Persona): number {
	return persona.truth.birthday
		? totalCents - Math.round((totalCents * 20) / 100)
		: totalCents
}

export function totalOf(lines: Line[], catalog: Catalog): number {
	return lines.reduce(
		(sum, l) => sum + (catalog.get(l.slug)?.priceCents ?? 0) * l.quantity,
		0,
	)
}

export function sameLines(a: Line[] | null, b: Line[] | null): boolean {
	const key = (ls: Line[] | null) =>
		(ls ?? [])
			.map((l) => `${l.slug}x${l.quantity}`)
			.sort()
			.join(',')
	return key(a) === key(b)
}

// A proposal that changed on this turn. `move` is what the buyer just asked
// for; null before the first proposal.
export function checkProposal(
	lines: Line[],
	prev: Line[] | null,
	move: Move | null,
	persona: Persona,
	catalog: Catalog,
): Violations {
	const t = persona.truth
	const days = workingDaysUntil(TODAY, t.neededBy)
	const v: Violations = {
		unknown: [],
		outOfStock: [],
		wrongAge: [],
		late: [],
		owned: [],
		overBudget: false,
		unasked: [],
	}
	for (const l of lines) {
		const p = catalog.get(l.slug)
		if (!p) {
			v.unknown.push(l.slug)
			continue
		}
		if (p.stock === 0 || l.quantity > p.stock) v.outOfStock.push(l.slug)
		if (
			(p.ageMin !== null && t.ageYears < p.ageMin) ||
			(p.ageMax !== null && t.ageYears > p.ageMax)
		)
			v.wrongAge.push(l.slug)
		if (p.deliveryDays > days) v.late.push(l.slug)
		if (t.owns.includes(l.slug)) v.owned.push(l.slug)
	}
	// More of an item the buyer asked for is the buyer's call, not the
	// agent's; every other proposal must fit.
	v.overBudget =
		move?.kind !== 'quantity' &&
		payable(totalOf(lines, catalog), persona) > t.budgetCents
	const before = new Set((prev ?? []).map((l) => l.slug))
	const added = lines.filter((l) => !before.has(l.slug)).map((l) => l.slug)
	if (prev === null) v.unasked = added.slice(t.wants)
	else if (move?.kind !== 'more') v.unasked = added
	return v
}

export function countViolations(v: Violations): number {
	return (
		v.unknown.length +
		v.outOfStock.length +
		v.wrongAge.length +
		v.late.length +
		v.owned.length +
		(v.overBudget ? 1 : 0) +
		v.unasked.length
	)
}

const DOLLARS = /\$\s?(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/g
const cents = (s: string) => Math.round(Number(s.replace(/,/g, '')) * 100)
const AMOUNT = String.raw`\$\s?(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)`
const TOTAL = [
	new RegExp(String.raw`\btotal(?:ing|s)?\b[^$.?]{0,40}${AMOUNT}`, 'i'),
	new RegExp(String.raw`${AMOUNT}\s+(?:in\s+)?total\b`, 'i'),
	new RegExp(String.raw`\b(?:comes|brings it|adds up)\s+to\s+${AMOUNT}`, 'i'),
]
const REMAINDER = [
	new RegExp(
		String.raw`${AMOUNT}\s+(?:of your budget\s+)?(?:left|remaining|to spare)`,
		'i',
	),
	new RegExp(
		String.raw`\bleav(?:es|ing)\s+(?:you\s+)?(?:with\s+)?${AMOUNT}`,
		'i',
	),
	new RegExp(String.raw`\b(?:left|remaining)\b[^$.?]{0,20}${AMOUNT}`, 'i'),
]

// "I've put together a cart with" describes a proposal, not the cart.
const CART_CLAIM =
	/\b(?:have|has|I've|is now|are now)\s+(?:been\s+)?(?:added|removed|put(?!\s+together)|placed|taken)\b(?:[^.]|\.\d)*\bcart\b|\b(?:is|are) (?:now )?in (?:the|your) cart\b/i
const OFFER_MORE =
	/\b(?:add|include|throw in|pick|choose|get)\b[^.?]*\b(?:anything|something|more|another|extra|second|third|remaining|rest)\b[^.]*\?|\banything else\b[^.]*\?/i

// `seen` holds every amount the agent could legitimately repeat: the budget,
// catalog prices, and the line totals, totals and remainders of every
// proposal so far.
export function checkText(
	reply: string,
	turn: {
		proposal: Line[] | null
		prev: Line[] | null
		committed: Line[] | null
		move: Move | null
	},
	budgetCents: number,
	seen: Set<number>,
	catalog: Catalog,
	persona: Persona,
): TextChecks {
	const { proposal, prev } = turn
	// A sum the agent worked out right from products it names in the same
	// reply is arithmetic, not invention.
	// Replies shorten names: "Atlas of Space" for "Atlas of Space for Young
	// Explorers", so a product counts as named by its first three words.
	const lower = reply.toLowerCase()
	const named = [...catalog.values()]
		.filter((p) =>
			lower.includes(
				p.name
					.split(/[,:(]/)[0]
					.trim()
					.split(/\s+/)
					.slice(0, 3)
					.join(' ')
					.toLowerCase(),
			),
		)
		.slice(0, 6)
		.map((p) => p.priceCents)
	let sums = [0]
	for (const price of named)
		sums = sums.flatMap((s) => [s, s + price, s + 2 * price])
	const derived = new Set(
		sums.flatMap((s) => {
			const p = payable(s, persona)
			return [s, budgetCents - s, p, budgetCents - p]
		}),
	)
	const invented = [...reply.matchAll(DOLLARS)]
		.map((m) => cents(m[1]))
		.filter((c) => !seen.has(c) && !derived.has(c))
	let wrongTotal: number | null = null
	let wrongRemainder: number | null = null
	if (proposal) {
		const totals = [proposal, prev ?? proposal].flatMap((ls) => {
			const t = totalOf(ls, catalog)
			return [t, payable(t, persona)]
		})
		for (const re of TOTAL) {
			const m = reply.match(re)
			if (m && !totals.includes(cents(m[1]))) wrongTotal = cents(m[1])
		}
		for (const re of REMAINDER) {
			const m = reply.match(re)
			// "If we keep only the tea, $48 is left" is arithmetic on named
			// items, not a wrong remainder.
			if (
				m &&
				!totals.some((t) => budgetCents - t === cents(m[1])) &&
				!derived.has(cents(m[1]))
			)
				wrongRemainder = cents(m[1])
		}
	}
	return {
		invented,
		wrongTotal,
		wrongRemainder,
		falseCartClaim: turn.committed === null && CART_CLAIM.test(reply),
		offeredMore: turn.move?.kind !== 'more' && OFFER_MORE.test(reply),
	}
}

export function amountsOf(
	lines: Line[],
	budgetCents: number,
	catalog: Catalog,
	persona: Persona,
): number[] {
	const total = totalOf(lines, catalog)
	const pay = payable(total, persona)
	return [
		total,
		Math.abs(budgetCents - total),
		pay,
		total - pay,
		Math.abs(budgetCents - pay),
		...lines.map((l) => (catalog.get(l.slug)?.priceCents ?? 0) * l.quantity),
	]
}
