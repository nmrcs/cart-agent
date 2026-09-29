import { z } from 'zod'

// The whole store runs in one currency. Prices are integers in cents.
export const CURRENCY = 'USD'

export const Category = z.object({
	slug: z.string(),
	name: z.string(),
	productCount: z.number().int().nonnegative(),
})
export type Category = z.infer<typeof Category>

export const Tag = z.object({ slug: z.string(), name: z.string() })
export type Tag = z.infer<typeof Tag>

export const ProductImage = z.object({
	url: z.string(),
	alt: z.string(),
})
export type ProductImage = z.infer<typeof ProductImage>

// What a card in the grid, the chat or the cart needs.
export const ProductSummary = z.object({
	id: z.string().uuid(),
	slug: z.string(),
	name: z.string(),
	priceCents: z.number().int().positive(),
	stock: z.number().int().nonnegative(),
	deliveryDays: z.number().int().positive(),
	category: z.object({ slug: z.string(), name: z.string() }),
	image: ProductImage,
})
export type ProductSummary = z.infer<typeof ProductSummary>

export const ProductDetail = ProductSummary.extend({
	description: z.string(),
	ageMin: z.number().int().nullable(),
	ageMax: z.number().int().nullable(),
	tags: z.array(Tag),
	// Ordered: the first is the main square image.
	images: z.array(ProductImage),
	// What the product does not work without and does not include.
	requires: z.array(ProductSummary),
})
export type ProductDetail = z.infer<typeof ProductDetail>

export const ProductListQuery = z.object({
	category: z.string().optional(),
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(48).default(12),
})
export type ProductListQuery = z.infer<typeof ProductListQuery>

export const ProductPage = z.object({
	items: z.array(ProductSummary),
	page: z.number().int(),
	pageSize: z.number().int(),
	total: z.number().int(),
})
export type ProductPage = z.infer<typeof ProductPage>
