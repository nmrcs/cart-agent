import { z } from 'zod'
import { ProductSummary } from './catalog'
import { Discount } from './promotion'

export const CartLine = z.object({
	product: ProductSummary,
	quantity: z.number().int().positive(),
	// Computed by the backend from the current price; never sent by a client.
	lineTotalCents: z.number().int().nonnegative(),
})
export type CartLine = z.infer<typeof CartLine>

export const Cart = z.object({
	id: z.string().uuid(),
	lines: z.array(CartLine),
	itemCount: z.number().int().nonnegative(),
	subtotalCents: z.number().int().nonnegative(),
	discount: Discount.nullable(),
	totalCents: z.number().int().nonnegative(),
	// Set when the assistant put a birthday gift in the cart. The discount
	// holds while the birthday qualifies, whatever the buyer edits by hand.
	birthdayOn: z.string().nullable(),
})
export type Cart = z.infer<typeof Cart>

// Sets the quantity of one product; 0 removes the line.
export const SetCartItemRequest = z.object({
	quantity: z.number().int().min(0).max(99),
})
export type SetCartItemRequest = z.infer<typeof SetCartItemRequest>
