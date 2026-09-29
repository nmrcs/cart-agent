import { CURRENCY } from '@cart-agent/contracts'

const format = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: CURRENCY,
})

export function money(cents: number): string {
	return format.format(cents / 100)
}
