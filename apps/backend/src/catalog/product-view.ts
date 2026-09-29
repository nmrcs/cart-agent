import type { ProductDetail, ProductSummary } from '@cart-agent/contracts'
import type { Prisma } from '../generated/prisma/client'

// The one include every summary is read with, so the grid, the cart and the
// assistant show the same fields.
export const summaryInclude = {
	category: { select: { slug: true, name: true } },
	images: { orderBy: { position: 'asc' }, take: 1 },
} satisfies Prisma.ProductInclude

type SummaryRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>

export function toSummary(p: SummaryRow): ProductSummary {
	const image = p.images[0] ?? { url: '', alt: p.name }
	return {
		id: p.id,
		slug: p.slug,
		name: p.name,
		priceCents: p.priceCents,
		stock: p.stock,
		deliveryDays: p.deliveryDays,
		category: p.category,
		image: { url: image.url, alt: image.alt },
	}
}

export const detailInclude = {
	category: { select: { slug: true, name: true } },
	images: { orderBy: { position: 'asc' } },
	tags: { select: { slug: true, name: true }, orderBy: { name: 'asc' } },
	requires: { include: summaryInclude, orderBy: { name: 'asc' } },
} satisfies Prisma.ProductInclude

type DetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>

export function toDetail(p: DetailRow): ProductDetail {
	return {
		...toSummary(p),
		description: p.description,
		ageMin: p.ageMin,
		ageMax: p.ageMax,
		tags: p.tags,
		images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
		requires: p.requires.map(toSummary),
	}
}
