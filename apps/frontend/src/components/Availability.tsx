import type { ProductSummary } from '@cart-agent/contracts'
import { availability } from '../lib/product-facts'

const dot = {
	ok: 'bg-[oklch(0.65_0.13_150)]',
	low: 'bg-[oklch(0.75_0.14_70)]',
	out: 'bg-[oklch(0.62_0.18_25)]',
}

export function Availability({
	product,
	className = '',
	short = false,
}: {
	product: Pick<ProductSummary, 'stock' | 'deliveryDays'>
	className?: string
	short?: boolean
}) {
	const a = availability(product, short)
	return (
		<span
			className={`inline-flex items-center gap-1.5 text-muted ${className}`}
		>
			<span className={`size-1.5 rounded-full ${dot[a.tone]}`} aria-hidden />
			{a.text}
		</span>
	)
}
