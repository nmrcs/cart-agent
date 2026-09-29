// The composer may only repeat amounts it was given. Any other dollar figure
// in its reply is treated as invented and the reply is not used.

const DOLLARS = /\$\s?(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/g

export function amountsIn(text: string): number[] {
	return [...text.matchAll(DOLLARS)].map((m) =>
		Math.round(Number(m[1].replace(/,/g, '')) * 100),
	)
}

export function inventedAmounts(
	text: string,
	allowedCents: number[],
): number[] {
	const allowed = new Set(allowedCents)
	return amountsIn(text).filter((c) => !allowed.has(c))
}

export function usd(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`
}

// The style rules the composer is given and a small model does not always
// keep. A reply that breaks one is replaced by the template, like an invented
// price is.
const OFF_STYLE = [
	/\bwonderful\b/i,
	/\bperfect/i,
	/\blovely\b/i,
	/\bgreat choice\b/i,
	/!/,
	/\bcard\b/i,
	/\bwe\b/i,
]

export function offStyle(text: string, allowedWords: string): string | null {
	const hit = OFF_STYLE.find((re) => re.test(text) && !re.test(allowedWords))
	return hit ? hit.source : null
}
