import type { ProductSummary } from '@cart-agent/contracts'
import { Button } from '@heroui/react'
import { useCart, useQuantity } from '../store/cart'
import { QuantityStepper } from './QuantityStepper'

// "Add" until the product is in the cart, then the stepper that edits it.
export function AddToCart({
	product,
	size = 'md',
	fullWidth = false,
}: {
	product: Pick<ProductSummary, 'slug' | 'name' | 'stock'>
	size?: 'sm' | 'md' | 'lg'
	fullWidth?: boolean
}) {
	const quantity = useQuantity(product.slug)
	const setQuantity = useCart((s) => s.setQuantity)
	const pending = useCart((s) => s.pending === product.slug)

	if (product.stock === 0) {
		return (
			<Button size={size} variant="secondary" isDisabled fullWidth={fullWidth}>
				Out of stock
			</Button>
		)
	}
	if (quantity > 0) {
		return (
			<QuantityStepper
				slug={product.slug}
				name={product.name}
				max={product.stock}
				size={size === 'lg' ? 'md' : 'sm'}
			/>
		)
	}
	return (
		<Button
			size={size}
			variant={size === 'sm' ? 'secondary' : 'primary'}
			isPending={pending}
			fullWidth={fullWidth}
			onPress={() => void setQuantity(product.slug, 1)}
		>
			Add to cart
		</Button>
	)
}
