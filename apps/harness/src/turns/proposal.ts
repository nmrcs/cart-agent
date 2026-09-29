// Cart arithmetic without a model. Prices here are only used to decide what
// fits; the backend's quote is what the buyer sees.

export type Line = { slug: string; quantity: number }
export type Priced = { slug: string; priceCents: number }

// Takes ranked picks in order and keeps each one that still fits the budget,
// up to `count` items. A pick that does not fit is skipped, not truncated.
export function fillWithinBudget(
	ranked: Priced[],
	budgetCents: number,
	count: number,
): Line[] {
	const lines: Line[] = []
	let spent = 0
	for (const p of ranked) {
		if (lines.length >= count) break
		if (spent + p.priceCents > budgetCents) continue
		lines.push({ slug: p.slug, quantity: 1 })
		spent += p.priceCents
	}
	return lines
}

// Applies the buyer's edits: a quantity for a line already proposed, 0 to
// drop it, or a quantity for an alternative to bring it in.
export function applyChanges(
	lines: Line[],
	changes: { slug: string; quantity: number }[],
): Line[] {
	const next = lines.map((l) => ({ ...l }))
	for (const c of changes) {
		const existing = next.find((l) => l.slug === c.slug)
		if (existing) existing.quantity = c.quantity
		else if (c.quantity > 0) next.push({ slug: c.slug, quantity: c.quantity })
	}
	return next.filter((l) => l.quantity > 0)
}
