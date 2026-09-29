import { z } from 'zod'
import { CartLine } from './cart'
import { Discount } from './promotion'

// Prices a set of lines against the catalog without touching any cart. The
// harness asks for a quote; it never computes a price or a total itself.
export const QuoteRequest = z.object({
	lines: z
		.array(
			z.object({
				slug: z.string(),
				quantity: z.number().int().min(1).max(99),
			}),
		)
		.max(20),
	// The recipient's birthday as the buyer gave it. The backend decides
	// whether it earns the discount; the caller cannot set a percent.
	birthdayOn: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	// Tests and the bench pin the date; otherwise it is the server's.
	today: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
})
export type QuoteRequest = z.infer<typeof QuoteRequest>

export const QuoteProblem = z.object({
	slug: z.string(),
	code: z.enum(['not_found', 'insufficient_stock']),
	available: z.number().int().nonnegative(),
})
export type QuoteProblem = z.infer<typeof QuoteProblem>

export const Quote = z.object({
	lines: z.array(CartLine),
	subtotalCents: z.number().int().nonnegative(),
	discount: Discount.nullable(),
	// The subtotal less the discount: what the buyer pays.
	totalCents: z.number().int().nonnegative(),
	problems: z.array(QuoteProblem),
})
export type Quote = z.infer<typeof Quote>
