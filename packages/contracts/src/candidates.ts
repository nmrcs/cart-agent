import { z } from 'zod'
import { ProductSummary } from './catalog'

// The shortlist the harness may choose from. Every filter here is a hard
// constraint applied by the backend, not a preference the model weighs.
export const CandidateQuery = z.object({
	ageYears: z.coerce.number().int().min(0).max(120).optional(),
	maxPriceCents: z.coerce.number().int().positive().optional(),
	maxDeliveryDays: z.coerce.number().int().min(0).optional(),
	exclude: z
		.string()
		.optional()
		.transform((s) => (s ? s.split(',').filter(Boolean) : [])),
})
export type CandidateQuery = z.input<typeof CandidateQuery>

export const Candidate = ProductSummary.extend({
	description: z.string(),
	ageMin: z.number().int().nullable(),
	ageMax: z.number().int().nullable(),
	tags: z.array(z.string()),
	requires: z.array(ProductSummary),
})
export type Candidate = z.infer<typeof Candidate>
