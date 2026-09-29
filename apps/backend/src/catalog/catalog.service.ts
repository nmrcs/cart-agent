import { Injectable, NotFoundException } from '@nestjs/common'
import type {
	Candidate,
	Category,
	ProductDetail,
	ProductListQuery,
	ProductPage,
} from '@cart-agent/contracts'
import type { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
	detailInclude,
	summaryInclude,
	toDetail,
	toSummary,
} from './product-view'

@Injectable()
export class CatalogService {
	constructor(private readonly prisma: PrismaService) {}

	async categories(): Promise<Category[]> {
		const rows = await this.prisma.category.findMany({
			orderBy: { position: 'asc' },
			include: { _count: { select: { products: true } } },
		})
		return rows.map((c) => ({
			slug: c.slug,
			name: c.name,
			productCount: c._count.products,
		}))
	}

	async products(query: ProductListQuery): Promise<ProductPage> {
		const category = query.category ?? null
		const skip = (query.page - 1) * query.pageSize
		// Store order, which Prisma's orderBy cannot express: what can be bought
		// first, then one item from each category in turn, so "All gifts" does
		// not open on a page of toys. Supplies are only listed in their own
		// category.
		const [ids, total] = await Promise.all([
			this.prisma.$queryRaw<{ id: string }[]>`
				SELECT p.id FROM "Product" p
				JOIN "Category" c ON c.id = p."categoryId"
				WHERE (${category}::text IS NULL AND NOT c."isSupply")
					OR c.slug = ${category}
				ORDER BY
					(p.stock = 0),
					ROW_NUMBER() OVER (PARTITION BY p."categoryId" ORDER BY p.name),
					c.position
				LIMIT ${query.pageSize} OFFSET ${skip}`,
			this.prisma.product.count({
				where: category
					? { category: { slug: category } }
					: { category: { isSupply: false } },
			}),
		])
		const rows = await this.prisma.product.findMany({
			where: { id: { in: ids.map((r) => r.id) } },
			include: summaryInclude,
		})
		const byId = new Map(rows.map((r) => [r.id, r]))
		return {
			items: ids.flatMap((r) => {
				const row = byId.get(r.id)
				return row ? [toSummary(row)] : []
			}),
			page: query.page,
			pageSize: query.pageSize,
			total,
		}
	}

	async product(slug: string): Promise<ProductDetail> {
		const row = await this.prisma.product.findUnique({
			where: { slug },
			include: detailInclude,
		})
		if (!row) throw new NotFoundException('product not found')
		return toDetail(row)
	}

	// The harness's shortlist. Every filter is a hard rule enforced here, so
	// whatever the model later picks from the list already fits the age, the
	// stock, the delivery date and the budget. Supplies are never candidates.
	async candidates(q: {
		ageYears?: number
		maxPriceCents?: number
		maxDeliveryDays?: number
		exclude: string[]
	}): Promise<Candidate[]> {
		const where: Prisma.ProductWhereInput = {
			stock: { gt: 0 },
			category: { isSupply: false },
			slug: q.exclude.length ? { notIn: q.exclude } : undefined,
			priceCents:
				q.maxPriceCents !== undefined ? { lte: q.maxPriceCents } : undefined,
			deliveryDays:
				q.maxDeliveryDays !== undefined
					? { lte: q.maxDeliveryDays }
					: undefined,
			AND:
				q.ageYears !== undefined
					? [
							{ OR: [{ ageMin: null }, { ageMin: { lte: q.ageYears } }] },
							{ OR: [{ ageMax: null }, { ageMax: { gte: q.ageYears } }] },
						]
					: undefined,
		}
		const rows = await this.prisma.product.findMany({
			where,
			include: {
				...summaryInclude,
				tags: { select: { slug: true } },
				requires: { include: summaryInclude },
			},
			orderBy: { name: 'asc' },
		})
		return rows.map((p) => ({
			...toSummary(p),
			description: p.description,
			ageMin: p.ageMin,
			ageMax: p.ageMax,
			tags: p.tags.map((t) => t.slug),
			requires: p.requires.map(toSummary),
		}))
	}
}
