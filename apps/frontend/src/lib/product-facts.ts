import type { ProductSummary } from '@cart-agent/contracts'

export function ageLabel(
	min: number | null,
	max: number | null,
): string | null {
	if (min === null && max === null) return null
	if (min === 0 && max === null) return 'From birth'
	if (max === null) return `Ages ${min}+`
	if (min === null) return `Up to ${max} years`
	return `Ages ${min}–${max}`
}

export function deliveryLabel(days: number): string {
	return days === 1 ? 'Delivered tomorrow' : `Delivered in ${days} working days`
}

// The same fact in the few words a product card has room for.
export function deliveryShort(days: number): string {
	return days === 1 ? 'Delivery tomorrow' : `Delivery in ${days} days`
}

// The one line under a price: out of stock beats everything, a short stock
// beats delivery.
export function availability(
	p: Pick<ProductSummary, 'stock' | 'deliveryDays'>,
	short = false,
): { text: string; tone: 'ok' | 'low' | 'out' } {
	if (p.stock === 0) return { text: 'Out of stock', tone: 'out' }
	if (p.stock <= 5) return { text: `Only ${p.stock} left`, tone: 'low' }
	return {
		text: short ? deliveryShort(p.deliveryDays) : deliveryLabel(p.deliveryDays),
		tone: 'ok',
	}
}
