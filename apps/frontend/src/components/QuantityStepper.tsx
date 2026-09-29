import { NumberField } from '@heroui/react'
import { useCart, useQuantity } from '../store/cart'

export function QuantityStepper({
	slug,
	name,
	max,
	size = 'md',
}: {
	slug: string
	name: string
	max: number
	size?: 'sm' | 'md'
}) {
	const quantity = useQuantity(slug)
	const setQuantity = useCart((s) => s.setQuantity)
	const pending = useCart((s) => s.pending === slug)
	return (
		<NumberField
			aria-label={`Quantity of ${name}`}
			value={quantity}
			minValue={0}
			maxValue={Math.min(max, 99)}
			isDisabled={pending}
			onChange={(q) => {
				if (Number.isFinite(q) && q !== quantity) void setQuantity(slug, q)
			}}
			className={size === 'sm' ? 'w-28' : 'w-32'}
		>
			<NumberField.Group>
				<NumberField.DecrementButton />
				<NumberField.Input className="tabular text-center" />
				<NumberField.IncrementButton />
			</NumberField.Group>
		</NumberField>
	)
}
